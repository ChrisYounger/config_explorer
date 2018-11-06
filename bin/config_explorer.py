# Copyright (C) 2018 Chris Younger

import splunk, sys, os, time, json, re, shutil, subprocess, platform, logging, logging.handlers

class req(splunk.rest.BaseRestHandler):
	def handle_POST(self):
		sessionKey = self.sessionKey
		textchars = bytearray({7,8,9,10,12,13,27} | set(range(0x20, 0x100)) - {0x7f})
		
		is_binary_string = lambda bytes: bool(bytes.translate(None, textchars))
		
		SPLUNK_HOME = os.environ['SPLUNK_HOME']
		
		app_name = "config_explorer"
		conf = splunk.clilib.cli_common.getMergedConf(app_name)
		
		# From here: http://dev.splunk.com/view/logging/SP-CAAAFCN
		def setup_logging():
			logger = logging.getLogger("a")
			file_handler = logging.handlers.RotatingFileHandler(os.path.join(SPLUNK_HOME, 'var', 'log', 'splunk', app_name + ".log"), mode='a', maxBytes=25000000, backupCount=2)
			formatter = logging.Formatter("%(created)f %(levelname)s pid=%(process)d %(message)s")
			file_handler.setFormatter(formatter)
			logger.addHandler(file_handler)	
			logger.setLevel("INFO");
			return logger
		logger = setup_logging()
        
		def runCommand(cmds, use_shell=False, status_codes=[]):
			my_env = os.environ.copy()
			if confIsTrue("git"):
				my_env["GIT_DIR"] = os.path.join(SPLUNK_HOME, conf["default"]["git_dir"].strip("\""))
				my_env["GIT_WORK_TREE"] = os.path.join(SPLUNK_HOME, conf["default"]["git_work_tree"].strip("\""))
			p = subprocess.Popen(cmds, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=use_shell, env=my_env)
			o = p.communicate()
			status_codes.append(p.returncode)
			return str(o[0]) + "\n" + str(o[1]) + "\n"

		def git(message, git_status_codes, file1, file2=None):
			git_output = ""
			if confIsTrue("git"):
				try:
					if file2 == None:
						git_output += '$git add ' + file1 + "\n"
						git_output += runCommand(['git','add', file1], False, git_status_codes)
						git_output += "\n\n"
					else:
						git_output += '$git add ' + file1 + " " + file2 + "\n"
						git_output += runCommand(['git','add', file1, file2], False, git_status_codes)
						git_output += "\n\n"
					git_output += '$git commit -m ' + message + "\n"
					git_output_tmp = runCommand(['git','commit','-m', message], False, git_status_codes)
					git_output += re.sub(r"On branch \S*\s*\nUntracked [\s\S]+ but untracked files present", '', git_output_tmp)
					git_output += "\n\n"
				except Exception as ex:
					template = "Git failed. Is git installed and configured correctly? {0}: {1!r}"
					git_output += template.format(type(ex).__name__, ex.args)
					#self.response.setHeader('content-type', 'application/json')
					#self.response.write(json.dumps({'result': message, 'status': 'error', 'debug': debug}, ensure_ascii=False))		
			return git_output

		def confIsTrue(param):
			if conf["default"][param].lower().strip() in ("1", "true", "yes", "t", "y"):
				return True
			return False
			
		try:
			result = ""
			status = ""
			debug = ""
			git_output = ""
			git_status_codes = [0]
			action = self.request['form']['action']
			action_item = self.request['form']['path']
			param1 = self.request['form']['param1']
			
			server_response, server_content = splunk.rest.simpleRequest('/services/authentication/current-context?output_mode=json', sessionKey=sessionKey, raiseAllErrors=True)
			transforms_content = json.loads(server_content)
			user = transforms_content['entry'][0]['content']['username']
			capabilities = transforms_content['entry'][0]['content']['capabilities']
			
			# when config is locked, we automatically disable run and write access otherwise someone could just reverse it.
			if confIsTrue("lock_config"):
				conf["default"]["run_commands"] = "false"
				conf["default"]["write_access"] = "false"
			
			# dont allow write or run access unless the user makes the effort to set the capability
			if action == 'run' and not confIsTrue("run_commands"):
				status = "missing_perm_run"
					
			elif ((action in ['delete', 'rename', 'newfolder', 'newfile']) or (action == "save" and action_item != "")) and not confIsTrue("write_access"):
				status = "missing_perm_write"
			
			elif action == "save" and action_item == "" and confIsTrue("lock_config"):
				status = "config_locked"
			
			# we need to prevent even read access to admins so that people don't call our api and read the .secrets file
			elif not "admin_all_objects" in capabilities:
				status = "missing_perm_read"
				
			else:
				# when calling read or write with an empty argument it means we are trying to change the config
				if (action == 'read' or action == 'save') and action_item == "":
					localfolder = os.path.join(os.path.dirname( __file__ ), '..', 'local')
					action_item = os.path.join(os.path.dirname( __file__ ), '..', 'local', app_name + '.conf')
					if not os.path.exists(localfolder):
						os.makedirs(localfolder)
					if not os.path.exists(action_item):
						shutil.copyfile(os.path.join(os.path.dirname( __file__ ), '..','default', app_name + '.conf'), action_item)
					
				if action[:5] == 'btool' or action == 'run' or action == 'init' or action[:3] == 'git':
					system = platform.system()
					os.chdir(SPLUNK_HOME)
					if system != "Windows" and system != "Linux":
						status = "error"
						result = "Unable to run commands on this operating system: " + system
					else:
						if system == "Windows":
							cmd = "bin\\splunk"
						elif system == "Linux":
							cmd = "./bin/splunk"
							
						if action == 'init':
							result = {}
							result['files'] = runCommand([cmd, 'btool', 'check', '--debug'])
							result['conf'] = conf["default"]

						elif action == 'git-log':
							result = runCommand(['git', 'log', '--stat', '--max-count=200'])

						elif action == 'git-history':
							debug = action_item
							result = runCommand(['git', 'log', '--follow', '-p', '--', action_item])

						elif action == 'git-show':
							result = runCommand(['git', 'show', action_item])
							
						elif action == 'btool-check':
							result = runCommand([cmd, 'btool', 'check', '--debug'])
							result = result + runCommand([cmd, 'btool', 'find-dangling'])
							result = result + runCommand([cmd, 'btool', 'validate-strptime'])
							result = result + runCommand([cmd, 'btool', 'validate-regex'])
							
						elif action == 'btool-list':
							result = runCommand([cmd, 'btool', action_item, 'list', '--debug'])	
						
						elif action == 'run':
							result = runCommand(action_item, True)
							
						status = "success"

				else:
					if action[:4] == 'spec':
						spec_path = os.path.join(SPLUNK_HOME, 'etc', 'system', 'README', action_item + '.conf.spec')
						if os.path.exists(spec_path):
							with open(spec_path, 'r') as fh:
								result = fh.read()
								
						apps_path = os.path.join(SPLUNK_HOME, 'etc', 'apps')
						for d in os.listdir(apps_path):
							spec_path = os.path.join(apps_path, d, 'README', action_item + '.conf.spec')
							if os.path.exists(spec_path):
								with open(spec_path, 'r') as fh:
									result = result + fh.read()
						
						status = "success"
						
					else:
						base_path_abs = str(os.path.abspath(os.path.join(SPLUNK_HOME)))
						file_path = os.path.join(SPLUNK_HOME, action_item)
						file_path_abs = str(os.path.abspath(file_path))
						if file_path_abs.find(base_path_abs) != 0:
							status = "error" 
							result = "Unable to access path [" + file_path_abs + "] out of splunk directory [" + base_path_abs + "]"
							
						else:
							if action == 'save':
								if os.path.isdir(file_path):
									status = "error" 
									result = "Cannot save file as a folder"
									
								elif not os.path.exists(file_path):
									status = "error" 
									result = "Cannot save to a file that does not exist"
								
								else:
									git("unknown", git_status_codes, file_path)
									with open(file_path, "w") as fh:
										fh.write(param1)
									
									git_output += git(user + " save ", git_status_codes, file_path)
									status = "success" 
									 
							elif action == 'read':
								if os.path.isdir(file_path):
									result = []
									for f in os.listdir(file_path):
										if os.path.isdir(os.path.join(file_path, f)):
											# for sorting
											result.append("D" + f)
										else:
											result.append("F" + f)
									status = "success"
											
								else:
									fsize = os.path.getsize(file_path) / 1000000
									if fsize > int(conf["default"]["max_file_size"]):
										status = "error"
										result = "File too large to open. File size is " + str(fsize) + " MB and the configured limit is " + conf["default"]["max_file_size"] + " MB"
									else:
										with open(file_path, 'r') as fh:
											result = fh.read()
											status = "success"
									if is_binary_string(result):
										result = "unable to open binary file"
										status = "error"
										
							elif action == 'delete':
								git("unknown", git_status_codes, file_path)
								if os.path.isdir(file_path):
									shutil.rmtree(file_path)
									
								else:
									os.remove(file_path)
									
								git_output += git(user + " deleted ", git_status_codes, file_path)
								status = "success"
								
							else:
								if re.search(r'[^A-Za-z0-9_\- \.]', param1):
									result = "New name contains invalid characters"
									status = "error"
									
								elif action == 'rename':
									new_path = os.path.join(os.path.dirname(file_path), param1)
									if os.path.exists(new_path):
										result = "That already exists"
										status = "error"
										
									else:
										git("unknown", git_status_codes, file_path)
										os.rename(file_path, new_path)
										git_output += git(user + " renamed", git_status_codes, new_path, file_path)
										status = "success"
										
								else:
									new_path = os.path.join(file_path, param1)
									if os.path.exists(new_path):
										result = "That already exists"
										status = "error"
										
									elif action == 'newfolder':
										os.makedirs(new_path)
										status = "success"
										
									elif action == 'newfile':
										open(new_path, 'w').close()
										git_output += git(user + " new", git_status_codes, new_path)
										status = "success"
									
			self.response.setHeader('content-type', 'application/json')
			self.response.write(json.dumps({'result': result, 'status': status, 'debug': debug, 'git': git_output, 'git_status': max(git_status_codes)}, ensure_ascii=False))
			
			if action == 'save' or param1 == 'undefined':
				param1 = ""
			reason = ""		
			if status == "error":
				reason = result
			logger.info('user={} action={} item="{}" param1="{}" status={} reason="{}"'.format(user, action, action_item, status, param1, reason))
			
		except Exception as ex:
			template = "An exception of type {0} occurred. Arguments:\n{1!r}"
			message = template.format(type(ex).__name__, ex.args)
			self.response.setHeader('content-type', 'application/json')
			self.response.write(json.dumps({'result': message, 'status': 'error', 'debug': debug}, ensure_ascii=False))			
			
	def handle_GET(self):
		self.response.setHeader('content-type', 'text/html')
		self.response.write('<p>Webservice is working but it must be called via POST!</p>')
