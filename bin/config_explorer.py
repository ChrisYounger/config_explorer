# Copyright (C) 2018 Chris Younger

import splunk, sys, os, time, json, re, shutil, subprocess, platform, logging, logging.handlers
from urlparse import parse_qs

class req(splunk.rest.BaseRestHandler):
	def handle_POST(self):
		sessionKey = self.sessionKey
		textchars = bytearray({7,8,9,10,12,13,27} | set(range(0x20, 0x100)) - {0x7f})
		
		is_binary_string = lambda bytes: bool(bytes.translate(None, textchars))
		
		SPLUNK_HOME = os.environ['SPLUNK_HOME']
		
		app_name = "config_explorer"
		conf = splunk.clilib.cli_common.getMergedConf(app_name)
		env_copy = os.environ.copy()
		env_git = os.environ.copy()

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
        
		def runCommand(cmds, this_env, status_codes=[]):
			p = subprocess.Popen(cmds, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, shell=False, env=this_env)
			o = p.communicate()
			status_codes.append(p.returncode)
			return str(o[0]) + "\n"

		def runCommandCustom(cmds):
			# TODO timeout after: int(conf["global"]["run_timeout"])
			p = subprocess.Popen(cmds, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, shell=True, env=env_copy)
			o = p.communicate()
			return str(o[0]) + "\n"

		def git(message, git_status_codes, git_output, file1, file2=None):
			if confIsTrue("git_autocommit", False):
				try:
					if file2 == None:
						git_output.append({"type": "cmd", "content": '$git add ' + file1})
						git_output.append({"type": "out", "content": runCommand(['git','add', file1], env_git, git_status_codes)})
					else:
						git_output.append({"type": "cmd", "content": '$git add ' + file1 + " " + file2})
						git_output.append({"type": "out", "content": runCommand(['git','add', file1, file2], env_git, git_status_codes)})

					git_output.append({"type": "cmd", "content": '$git commit -m ' + message})
					#git_output_tmp = runCommand(['git','commit','-m', message], env_git, git_status_codes)
					#git_output.append({"type": "cmd", "content": re.sub(r"On branch \S*\s*\nUntracked [\s\S]+ but untracked files present", '', git_output_tmp)})
					git_output.append({"type": "out", "content": runCommand(['git','commit','-m', message], env_git, git_status_codes)})
				except Exception as ex:
					template = "{0}: {1!r}"
					git_output.append({"type": "desc", "content": "Git failed. Is git installed and configured correctly?"})
					git_output.append({"type": "out", "content": template.format(type(ex).__name__, ex.args)})

		def confIsTrue(param, defaultValue):
			if param not in conf["global"]:
				return defaultValue
			if conf["global"][param].lower().strip() in ("1", "true", "yes", "t", "y"):
				return True
			return False

		try:
			result = ""
			status = ""
			debug = ""
			git_output = []
			git_status_codes = [0]
			payload = parse_qs(self.request['payload'])
			action = payload['action'][0]
			action_item = ""
			if 'path' in payload:
				action_item = payload['path'][0]
			param1 = ""
			if 'param1' in payload:
				param1 = payload['param1'][0]
			
			server_response, server_content = splunk.rest.simpleRequest('/services/authentication/current-context?output_mode=json', sessionKey=sessionKey, raiseAllErrors=True)
			transforms_content = json.loads(server_content)
			user = transforms_content['entry'][0]['content']['username']
			capabilities = transforms_content['entry'][0]['content']['capabilities']
					
			# dont allow write or run access unless the user makes the effort to set the capability
			if action == 'run' and not confIsTrue("run_commands", False):
				status = "missing_perm_run"
					
			elif ((action in ['delete', 'rename', 'newfolder', 'newfile']) or (action == "save" and action_item != "")) and not confIsTrue("write_access", False):
				status = "missing_perm_write"
			
			elif action == "save" and action_item == "" and confIsTrue("hide_settings", False):
				status = "config_locked"
			
			# we need to prevent even read access to admins so that people don't call our api and read the .secrets file
			elif not "admin_all_objects" in capabilities:
				status = "missing_perm_read"
				
			else:
				if confIsTrue("git_autocommit", False):
					git_output.append({"type": "out", "content": "cwd = " + os.getcwd() + "\n"})
					try:
						git_autocommit_dir = conf["global"]["git_autocommit_dir"].strip("\"")
						if git_autocommit_dir != "":
							env_git["GIT_DIR"] = os.path.join(SPLUNK_HOME, git_autocommit_dir)
							git_output.append({"type": "out", "content": "GIT_DIR=" + os.path.join(SPLUNK_HOME, git_autocommit_dir)})
					except KeyError:
						pass
					try:
						git_autocommit_work_tree = conf["global"]["git_autocommit_work_tree"].strip("\"")
						if git_autocommit_work_tree != "":
							env_git["GIT_WORK_TREE"] = os.path.join(SPLUNK_HOME, git_autocommit_work_tree)
							git_output.append({"type": "out", "content": "GIT_WORK_TREE=" + os.path.join(SPLUNK_HOME, git_autocommit_work_tree)})
					except KeyError:
						pass
					
				# when calling read or write with an empty argument it means we are trying to change the config
				if (action == 'read' or action == 'save') and action_item == "":
					localfolder = os.path.join(os.path.dirname( __file__ ), '..', 'local')
					action_item = os.path.join(os.path.dirname( __file__ ), '..', 'local', app_name + '.conf')
					if not os.path.exists(localfolder):
						os.makedirs(localfolder)
					if not os.path.exists(action_item):
						shutil.copyfile(os.path.join(os.path.dirname( __file__ ), '..','default', app_name + '.conf.example'), action_item)
					
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
							result['files'] = runCommand([cmd, 'btool', 'check', '--debug'], env_copy)
							result['conf'] = conf

						elif action == 'git-log':
							result = runCommand(['git', 'log', '--stat', '--max-count=200'], env_git)

						elif action == 'git-history':
							debug = action_item
							result = runCommand(['git', 'log', '--follow', '-p', '--', action_item], env_git)

						elif action == 'git-show':
							result = runCommand(['git', 'show', action_item], env_git)
							
						elif action == 'btool-check':
							result = runCommand([cmd, 'btool', 'check', '--debug'], env_copy)
							result = result + runCommand([cmd, 'btool', 'find-dangling'], env_copy)
							result = result + runCommand([cmd, 'btool', 'validate-strptime'], env_copy)
							result = result + runCommand([cmd, 'btool', 'validate-regex'], env_copy)
							
						elif action == 'btool-list':
							result = runCommand([cmd, 'btool', action_item, 'list', '--debug'], env_copy)	
						
						elif action == 'run':
							# dont need to check if we are inside Splunk dir. User can do anything with run command anyway.
							file_path = os.path.join(SPLUNK_HOME, param1)
							os.chdir(file_path)
							result = runCommandCustom(action_item)
							
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
									os.chdir(os.path.dirname(file_path))
									git_output.append({"type": "desc", "content": "Committing file before saving changes"})
									git("unknown", git_status_codes, git_output, file_path)
									with open(file_path, "w") as fh:
										fh.write(param1)
									git_output.append({"type": "desc", "content": "Committing file after saving changes"})
									git(user + " save ", git_status_codes, git_output, file_path)
									status = "success" 

							elif action == 'fs':
								def pack(base, path, dirs, files):
									if len(path) == 0:
										for i in dirs: 
											base[i] = {}
										base["."] = files
									else:
										pack(base[path[0]], path[1:], dirs, files)

								result = {}
								cut = len(SPLUNK_HOME.split(os.path.sep))
								depth = int(conf["global"]["cache_file_depth"])
								for root, dirs, files in os.walk(SPLUNK_HOME):
									paths = root.split(os.path.sep)[cut:]
									pack(result, paths, dirs, files)
									if len(paths) >= depth:
										del dirs[:]

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
									if fsize > int(conf["global"]["max_file_size"]):
										status = "error"
										result = "File too large to open. File size is " + str(fsize) + " MB and the configured limit is " + conf["global"]["max_file_size"] + " MB"
									else:
										with open(file_path, 'r') as fh:
											result = fh.read()
											status = "success"
									if is_binary_string(result):
										result = "unable to open binary file"
										status = "error"
										
							elif action == 'delete':
								os.chdir(os.path.dirname(file_path))
								git_output.append({"type": "desc", "content": "Committing file before it is deleted"})
								git("unknown", git_status_codes, git_output, file_path)
								if os.path.isdir(file_path):
									shutil.rmtree(file_path)
									
								else:
									os.remove(file_path)
								git_output.append({"type": "desc", "content": "Deleting file"})
								git(user + " deleted ", git_status_codes, git_output, file_path)
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
										os.chdir(os.path.dirname(file_path))
										git_output.append({"type": "desc", "content": "Committing file before renaming"})	
										git("unknown", git_status_codes, git_output, file_path)
										os.rename(file_path, new_path)
										git_output.append({"type": "desc", "content": "Committing renamed file"})
										git(user + " renamed", git_status_codes, git_output, new_path, file_path)
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
										os.chdir(os.path.dirname(new_path))
										git(user + " new", git_status_codes, git_output, new_path)
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
