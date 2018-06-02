import splunk, sys, os, logging, time, json, re, shutil

class readfile(splunk.rest.BaseRestHandler):
	def handle_GET(self):
		sessionKey = self.sessionKey
		textchars = bytearray({7,8,9,10,12,13,27} | set(range(0x20, 0x100)) - {0x7f})
		is_binary_string = lambda bytes: bool(bytes.translate(None, textchars))
		try:
			result = ""
			info = ""
			action = self.request['query']['action']
			file_str = self.request['query']['path']
			base_path = [os.path.dirname( __file__ ), '..', '..']
			base_path_abs = os.path.abspath(os.path.join(*base_path))
			bits = base_path + file_str.split("/")
			file_path = os.path.join(*bits)
			file_path_abs = os.path.abspath(file_path)
			if (len(str(file_path_abs)) < len(str(base_path_abs))):
				info = "error" 
				result = "Unable to recurse out of splunk directory"
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
					new_name = self.request['query']['newname']
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
			self.response.write(json.dumps({'result': result, 'info': info}, ensure_ascii=False))
			
		except Exception as ex:
			template = "An exception of type {0} occurred. Arguments:\n{1!r}"
			message = template.format(type(ex).__name__, ex.args)			
			self.response.setHeader('content-type', 'text/html')
			self.response.write(message)
			
class writefile(splunk.rest.BaseRestHandler):
	def handle_POST(self):
		sessionKey = self.sessionKey
		try:
			file_str = self.request['form']['file']
			base_path = [os.path.dirname( __file__ ), '..', '..']
			bits = base_path + file_str.split("/")
			file_path = os.path.join(*bits)
			with open(os.path.join(file_path), "w") as fh:
				fh.write(self.request['form']['contents'])			  
			self.response.setHeader('content-type', 'application/json')
			self.response.write(json.dumps({'result': 1}, ensure_ascii=False))
			
		except Exception as ex:
			template = "An exception of type {0} occurred. Arguments:\n{1!r}"
			message = template.format(type(ex).__name__, ex.args)			
			self.response.setHeader('content-type', 'text/html')
			self.response.write(message)
