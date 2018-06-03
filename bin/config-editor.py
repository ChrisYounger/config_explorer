import splunk, sys, os, logging, time, json, re, shutil, subprocess, platform



class ceditor(splunk.rest.BaseRestHandler):
	def handle_GET(self):
		sessionKey = self.sessionKey
		textchars = bytearray({7,8,9,10,12,13,27} | set(range(0x20, 0x100)) - {0x7f})
		
		is_binary_string = lambda bytes: bool(bytes.translate(None, textchars))

		def runCommand(cmds):
			p = subprocess.Popen(cmds, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False)
			o = p.communicate()
			return str(o[0]) + "\n" + str(o[1]) + "\n"
	
		try:
			result = ""
			info = ""
			debug = ""
			action = self.request['query']['action']
			if action[:5] == 'btool':
				system = platform.system()
				splunk_base = os.path.join(os.path.dirname( __file__ ), '..', '..', '..', '..')
				os.chdir(splunk_base)
				if system != "Windows" and system != "Linux":
					info = "error"
					result = "Unable to run btool on this operating system: " + system				
				else:
					if system == "Windows":
						cmd = "bin\\splunk"
					elif system == "Linux":
						cmd = "./bin/splunk"
						
					if action == 'btool-check':
						result = runCommand([cmd, 'btool', 'check', '--debug'])
						result = result + runCommand([cmd, 'btool', 'find-dangling'])
						result = result + runCommand([cmd, 'btool', 'validate-strptime'])
						result = result + runCommand([cmd, 'btool', 'validate-regex'])
						
					elif action == 'btool-list':
						result = runCommand([cmd, 'btool', self.request['query']['path'], 'list', '--debug'])	
						
					info = "success"

			else:
				file_str = self.request['query']['path']
				if action == 'spec':
					spec_path = os.path.join(os.path.dirname( __file__ ), '..', '..', '..', 'system', 'README', file_str + '.conf.spec')
					if os.path.exists(spec_path):
						with open(spec_path, 'r') as fh:
							result = fh.read()					
					apps_path = os.path.join(os.path.dirname( __file__ ), '..', '..')
					for d in os.listdir(apps_path):
						spec_path = os.path.join(apps_path, d, 'README', file_str + '.conf.spec')
						if os.path.exists(spec_path):
							with open(spec_path, 'r') as fh:
								result = result + fh.read()
					
				else:
					base_path = [os.path.dirname( __file__ ), '..', '..', '..', '..']
					base_path_abs = os.path.abspath(os.path.join(*base_path))
					bits = base_path + file_str.split("/")
					file_path = os.path.join(*bits)
					file_path_abs = os.path.abspath(file_path)				
						
					if (len(str(file_path_abs)) < len(str(base_path_abs))):
						info = "error" 
						result = "Unable to access files out of splunk directory"
						
					else:
						if action == 'read':
							if os.path.isdir(file_path):
								result = []
								info = "dir"
								for f in os.listdir(file_path):
									if os.path.isdir(os.path.join(file_path,f)):
										# for sorting
										result.append("D" + f)
									else:
										result.append("F" + f)								
							else:
								info = "file"
								with open(file_path, 'r') as fh:
									result = fh.read()
								if is_binary_string(result):
									result = "unable to open binary file"
									info = "error"
						elif action == 'delete':
							if os.path.isdir(file_path):
								shutil.rmtree(file_path)
							else:
								os.remove(file_path)
							info = "success"
						else:
							new_name = self.request['query']['param1']
							if re.search(r'[^A-Za-z0-9_\- \.]', new_name):
								result = "New name contains invalid characters"
								info = "error"
							elif action == 'rename':						
								new_path = os.path.join(os.path.dirname(file_path), new_name)
								if os.path.exists(new_path):
									result = "That already exists"
									info = "error"
								else:
									os.rename(file_path, new_path)
									info = "success"
							else:
								new_path = os.path.join(file_path, new_name)
								if os.path.exists(new_path):
									result = "That already exists"
									info = "error"
								elif action == 'newfolder':
									os.makedirs(new_path)
									info = "success"
								elif action == 'newfile':
									open(new_path, 'w').close()
									info = "success"
								
			self.response.setHeader('content-type', 'application/json')
			self.response.write(json.dumps({'result': result, 'info': info, 'debug': debug}, ensure_ascii=False))
			
		except Exception as ex:
			template = "An exception of type {0} occurred. Arguments:\n{1!r}"
			message = template.format(type(ex).__name__, ex.args)			
			self.response.setHeader('content-type', 'text/html')
			self.response.write(message)
			
	def handle_POST(self):
		sessionKey = self.sessionKey
		try:
			file_str = self.request['form']['file']
			base_path = [os.path.dirname( __file__ ), '..', '..', '..', '..']
			bits = base_path + file_str.split("/")
			file_path = os.path.join(*bits)
			with open(os.path.join(file_path), "w") as fh:
				fh.write(self.request['form']['contents'])			  
			self.response.setHeader('content-type', 'application/json')
			self.response.write(json.dumps({'info': 'success'}, ensure_ascii=False))
			
		except Exception as ex:
			template = "An exception of type {0} occurred. Arguments:\n{1!r}"
			message = template.format(type(ex).__name__, ex.args)			
			self.response.setHeader('content-type', 'text/html')
			self.response.write(message)
