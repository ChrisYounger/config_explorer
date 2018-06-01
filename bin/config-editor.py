import splunk, sys, os, logging, time, json

class readfile(splunk.rest.BaseRestHandler):
	def handle_GET(self):
		sessionKey = self.sessionKey
		try:
			file_str = self.request['query']['file']
			base_path = [os.path.dirname( __file__ ), '..', '..']
			bits = base_path + file_str.split("/")
			file_path = os.path.join(*bits)
			if os.path.isdir(file_path):
				contents = []
				for f in os.listdir(file_path):
					if os.path.isdir(os.path.join(file_path,f)):
						contents.append("D" + f)
					else:
						contents.append("F" + f)
			else:
				with open(file_path, 'r') as fh:
					contents = fh.read()
			self.response.setHeader('content-type', 'application/json')
			self.response.write(json.dumps({'result': contents}, ensure_ascii=False))
			
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
