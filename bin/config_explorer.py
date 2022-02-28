# Copyright (C) 2020 Chris Younger

import splunk, base64, sys, os, time, json, re, shutil, subprocess, platform, logging, logging.handlers
# range does not need to be imported from six. it is not used when running in python3 mode.
if sys.platform == "win32":
    import msvcrt
    # Binary mode is required for persistent mode on Windows.
    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stderr.fileno(), os.O_BINARY)

from splunk.persistconn.application import PersistentServerConnectionApplication
from splunk.clilib.cli_common import getMergedConf

app_name = "config_explorer"
SPLUNK_HOME = os.environ['SPLUNK_HOME']
# From here: http://dev.splunk.com/view/logging/SP-CAAAFCN
def setup_logging():
    logger = logging.getLogger("a")
    file_handler = logging.handlers.RotatingFileHandler(os.path.join(SPLUNK_HOME, 'var', 'log', 'splunk', app_name + ".log"), mode='a', maxBytes=25000000, backupCount=2)
    formatter = logging.Formatter("%(created)f %(levelname)s pid=%(process)d %(message)s")
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    logger.setLevel("INFO")
    return logger
logger = setup_logging()

class req(PersistentServerConnectionApplication):
    def __init__(self, command_line, command_arg):
        PersistentServerConnectionApplication.__init__(self)

    def handle(self, in_string):
        textchars = bytearray({7,8,9,10,12,13,27} | set(range(0x20, 0x100)) - {0x7f})
        is_binary_string = lambda bytes: bool(bytes.translate(None, textchars))
        debug = ""
        user = ""
        result = ""
        reason = ""
        form = {"action": "", "path": "", "param1": ""}
        try:
            conf = getMergedConf(app_name)
            in_payload = json.loads(in_string)

            if in_payload['method'] != "POST":
                return {'payload': {"message": "Webservice is working but it must be called via POST"}, 'status': 200 }

            def runCommand(cmds, this_env, status_codes=[]):
                p = subprocess.Popen(cmds, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, shell=False, env=this_env)
                o = p.communicate()
                status_codes.append(p.returncode)
                if sys.version_info < (3, 0):
                    return str(o[0]) + "\n"
                else:
                    return o[0].decode('utf-8') + "\n"

            def runCommandGit(git_output, git_status_codes, env_git, cmds):
                git_output.append({"type": "cmd", "content": '$ ' + " ".join(cmds)}) 
                git_output.append({"type": "out", "content": runCommand(cmds, env_git, git_status_codes)})
                git_output.append({"type": "cmd", "content": 'Ended with code: ' + str(git_status_codes[-1])})

            def runCommandCustom(cmds, env_copy):
                p = subprocess.Popen(cmds, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, shell=True, env=env_copy)
                o = p.communicate()
                if sys.version_info < (3, 0):
                    return str(o[0]) + "\n"
                else:
                    return o[0].decode('utf-8') + "\n"

            def git(message, git_status_codes, git_output, file1, file2=None):
                if confIsTrue("git_autocommit", False):
                    try:
                        files = [file1]
                        if file2 != None:
                            files.append(file2)

                        cmds = ['git','diff','--no-ext-diff','--quiet','--exit-code']
                        cmds.extend(files)
                        runCommandGit(git_output, git_status_codes, env_git, cmds)

                        if git_status_codes.pop() == 1:
                            git_output[-1]['content'] += ' (There are changes)'
                            cmds = ['git','add']
                            cmds.extend(files)
                            runCommandGit(git_output, git_status_codes, env_git, cmds)
                            cmds = ['git','commit','-uno','-m', message]
                            runCommandGit(git_output, git_status_codes, env_git, cmds)
                        else:
                            git_output[-1]['content'] += ' (No changes)'

                    except Exception as ex:
                        template = "{0}: {1!r}"
                        git_output.append({"type": "desc", "content": "Git failed. Is git installed and configured correctly?"})
                        git_output.append({"type": "out", "content": template.format(type(ex).__name__, ex.args)})
                        git_status_codes.append(1)

            def confIsTrue(param, defaultValue):
                if param not in conf["global"]:
                    return defaultValue
                if conf["global"][param].lower().strip() in ("1", "true", "yes", "t", "y"):
                    return True
                return False

            git_output = []
            git_status_codes = [-1]
            for formParam in in_payload['form']:
                form[formParam[0]] = formParam[1]

            user = in_payload['session']['user']

            # dont allow write or run access unless the user makes the effort to change the setting
            if form['action'] == 'run' and not confIsTrue("run_commands", False):
                reason = "missing_perm_run"

            elif ((form['action'] in ['delete', 'rename', 'newfolder', 'newfile', 'fileupload', 'fileuploade']) or (form['action'] == "save" and form['path'] != "")) and not confIsTrue("write_access", False):
                reason = "missing_perm_write"

            elif form['action'] == "save" and form['path'] == "" and confIsTrue("hide_settings", False):
                reason = "config_locked"

            else:
                env_copy = os.environ.copy()
                env_git = env_copy.copy()
                # inject the auth token so any shell'ed CLI commands will inherit permissions correctly
                env_copy["SPLUNK_TOK"] = in_payload['session']['authtoken'].encode('ascii','ignore').decode('ascii')
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
                if (form['action'] == 'read' or form['action'] == 'save') and form['path'] == "":
                    localfolder = os.path.join(os.path.dirname( __file__ ), '..', 'local')
                    form['path'] = os.path.join(os.path.dirname( __file__ ), '..', 'local', app_name + '.conf')
                    if not os.path.exists(localfolder):
                        os.makedirs(localfolder)
                    if not os.path.exists(form['path']):
                        shutil.copyfile(os.path.join(os.path.dirname( __file__ ), '..','default', app_name + '.conf.example'), form['path'])

                if form['action'][:5] == 'btool' or form['action'] == 'run' or form['action'] == 'deployserver' or form['action'] == 'init' or form['action'][:3] == 'git':
                    system = platform.system()
                    os.chdir(SPLUNK_HOME)
                    if system != "Windows" and system != "Linux" and system != "Darwin":
                        reason = "Unable to run commands on this operating system: " + system
                    else:
                        if system == "Windows":
                            cmd = "bin\\splunk"
                        else:
                            cmd = "./bin/splunk"

                        if form['action'] == 'init':
                            result = {}
                            result['files'] = runCommand([cmd, 'btool', 'check', '--debug'], env_copy)
                            result['conf'] = conf
                            result['system'] = system
                            result['python'] = sys.version

                        elif form['action'] == 'btool-check':
                            result = runCommand([cmd, 'btool', 'check', '--debug'], env_copy)
                            result = result + runCommand([cmd, 'btool', 'validate-strptime'], env_copy)
                            result = result + runCommand([cmd, 'btool', 'validate-regex'], env_copy)

                        elif form['action'] == 'btool-list':
                            if form['param1'] == "":
                                result = runCommand([cmd, 'btool', form['path'], 'list', '--debug'], env_copy)
                            else:
                                result = runCommand([cmd, 'btool', form['path'], 'list', '--debug', '--dir=' + form['param1']], env_copy)

                        elif form['action'] == 'deployserver':
                            if form['path'] == "":
                                result = runCommand([cmd, 'reload', 'deploy-server'], env_copy)
                            else:
                                result = runCommand([cmd, 'reload', 'deploy-server', '-class', form['path']], env_copy)

                        elif form['action'] == 'git-log':
                            os.chdir(form['path'])
                            result = runCommand(['git', 'log', '--stat', '--max-count=100'], env_git)

                        elif form['action'] == 'git-history':
                            os.chdir(os.path.join(SPLUNK_HOME, form['param1']))
                            result += runCommand(['git', 'log', '--follow', '-p', '--', os.path.join(SPLUNK_HOME, form['path'])], env_git)

                        elif form['action'] == 'run':
                            # dont need to check if we are inside Splunk dir. User can do anything with run command anyway.
                            file_path = os.path.join(SPLUNK_HOME, form['param1'])
                            os.chdir(file_path)
                            result = runCommandCustom(form['path'], env_copy)

                else:
                    if form['action'][:4] == 'spec':
                        spec_path = os.path.join(SPLUNK_HOME, 'etc', 'system', 'README', form['path'] + '.conf.spec')
                        if os.path.exists(spec_path):
                            with open(spec_path, 'r') as fh:
                                result = fh.read()

                        apps_path = os.path.join(SPLUNK_HOME, 'etc', 'apps')
                        for d in os.listdir(apps_path):
                            spec_path = os.path.join(apps_path, d, 'README', form['path'] + '.conf.spec')
                            if os.path.exists(spec_path):
                                with open(spec_path, 'r') as fh:
                                    result = result + fh.read()

                    elif form['action'] == 'filemods':
                        result = {}
                        pathsJson = json.loads(form['paths'])
                        for path in pathsJson:
                            path_full = os.path.join(SPLUNK_HOME, path)
                            if os.path.exists(path_full):
                                result[path] = round(os.path.getmtime(path_full))
                            else:
                                result[path] = ""

                    else:
                        base_path_abs = str(os.path.abspath(os.path.join(SPLUNK_HOME)))
                        file_path = os.path.join(SPLUNK_HOME, form['path'])
                        file_path_abs = str(os.path.abspath(file_path))
                        if file_path_abs.find(base_path_abs) != 0:
                            reason = "Unable to access path [" + file_path_abs + "] out of splunk directory [" + base_path_abs + "]"

                        else:
                            if form['action'] == 'save':
                                if os.path.isdir(file_path):
                                    reason = "Cannot save file as a folder"

                                elif not os.path.exists(file_path):
                                    reason = "Cannot save to a file that does not exist"

                                else:
                                    os.chdir(os.path.dirname(file_path))
                                    git_output.append({"type": "desc", "content": "Committing file before saving changes"})
                                    git("unknown", git_status_codes, git_output, file_path)
                                    with open(file_path, "w") as fh:
                                        fh.write(form['file'].replace('\r\n','\n'))
                                    git_output.append({"type": "desc", "content": "Committing file after saving changes"})
                                    git(user + " save ", git_status_codes, git_output, file_path)

                            elif form['action'] == 'fs':
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

                            elif form['action'] == 'read':
                                if os.path.isdir(file_path):
                                    result = []
                                    for f in os.listdir(file_path):
                                        path_full = os.path.join(os.path.join(file_path, f))
                                        mtime = -1;
                                        size = -1;
                                        ftype = 1;
                                        try:
                                            mtime = round(os.path.getmtime(path_full))
                                        except OSError:
                                            pass
                                        if not os.path.isdir(path_full):
                                            ftype = 0;
                                            try:
                                                size = os.path.getsize(path_full)
                                            except OSError:
                                                pass
                                        result.append([ftype,f,mtime,size])

                                else:
                                    fsize = os.path.getsize(file_path) / 1000000
                                    if fsize > int(conf["global"]["max_file_size"]):
                                        reason = "File too large to open. File size is " + str(fsize) + " MB and the configured limit is " + conf["global"]["max_file_size"] + " MB"
                                    else:
                                        try:
                                            with open(file_path, 'r') as fh:
                                                result = fh.read()
                                        except UnicodeDecodeError:
                                            reason = "binary_file"
                                    if sys.version_info < (3, 0) and is_binary_string(result):
                                        reason = "binary_file"

                            elif form['action'] == 'delete':
                                os.chdir(os.path.dirname(file_path))
                                git_output.append({"type": "desc", "content": "Committing file before it is deleted"})
                                git("unknown", git_status_codes, git_output, file_path)
                                if os.path.isdir(file_path):
                                    shutil.rmtree(file_path)
                                else:
                                    os.remove(file_path)
                                git_output.append({"type": "desc", "content": "Deleting file"})
                                git(user + " deleted ", git_status_codes, git_output, file_path)

                            elif form['action'] == 'filedownload':
                                os.chdir(SPLUNK_HOME)
                                if not os.path.exists(form['param1']):
                                    reason = "File not found"
                                else:
                                    with open(form['param1'], "rb") as fh:
                                        bin_data = fh.read()
                                        result = (base64.b64encode(bin_data)).decode('ascii')

                            elif form['action'][:10] == 'fileupload':
                                os.chdir(file_path)
                                if os.path.exists(form['param1']):
                                    reason = "File already exists"
                                #elif re.search(r'[^A-Za-z0-9_\- \.\(\)]', form['param1']):
                                #    reason = "Uploaded filename contains invalid characters"
                                else:
                                    with open(form['param1'], "wb") as fh:
                                        idx = form['file'].index(',')
                                        fh.write(base64.b64decode(form['file'][idx:]))
                                    git_output.append({"type": "desc", "content": "Adding uploaded file"})
                                    git(user + " uploaded ", git_status_codes, git_output, form['param1'])
                                    if form['action'] == 'fileuploade':
                                        status_codes = []
                                        #if file is tar or spl
                                        try:
                                            if re.search(r'\.(?:tgz|tar|spl)(?:$|\.)', form['param1']):
                                                result = runCommand(["tar","-xvf",form['param1']], env_copy, status_codes)
                                            elif re.search(r'\.zip$', form['param1']):
                                                result = runCommand(["unzip", form['param1']], env_copy, status_codes)
                                            else:
                                                result = "File uploaded but unable to extract due to unknown file extension"
                                            result += "status code=" + str(max(status_codes))
                                            if max(status_codes) == 0:
                                                os.remove(form['param1'])
                                                git_output.append({"type": "desc", "content": "Deleting file"})
                                                git(user + " deleted ", git_status_codes, git_output, file_path)
                                        except OSError:
                                            result += "File was uploaded but could not be extracted because the required application (tar/unzip) not found."


                            else:
                                #if re.search(r'[^A-Za-z0-9_\- \.\(\)]', form['param1']):
                                #    reason = "New name contains invalid characters"

                                if form['action'] == 'rename':
                                    new_path = os.path.join(os.path.dirname(file_path), form['param1'])
                                    if os.path.exists(new_path):
                                        reason = "That already exists"

                                    else:
                                        os.chdir(os.path.dirname(file_path))
                                        git_output.append({"type": "desc", "content": "Committing file before renaming"})
                                        git("unknown", git_status_codes, git_output, file_path)
                                        os.rename(file_path, new_path)
                                        git_output.append({"type": "desc", "content": "Committing renamed file"})
                                        git(user + " renamed", git_status_codes, git_output, new_path, file_path)

                                else:
                                    new_path = os.path.join(file_path, form['param1'])
                                    if os.path.exists(new_path):
                                        reason = "That already exists"

                                    elif form['action'] == 'newfolder':
                                        os.makedirs(new_path)

                                    elif form['action'] == 'newfile':
                                        open(new_path, 'w').close()
                                        #with open(new_path, "w") as fh:
                                        #    fh.write("")
                                        os.chdir(os.path.dirname(new_path))
                                        git(user + " new", git_status_codes, git_output, new_path)

            # result may contain binary if there is an attempted read on a binary file. This will break the json
            if reason != "":
                result = ""
            if not confIsTrue("git_autocommit", False):
                git_output = ""
            logger.info('user={} action={} item="{}" param1="{}" reason="{}"'.format(user, form['action'], form['path'], form['param1'], reason))
            return {'payload': {'result': result, 'reason': reason, 'debug': debug, 'git': git_output, 'git_status': max(git_status_codes)}, 'status': 200}

        except Exception as ex:
            template = "An exception of type {0} occurred. Arguments:\n{1!r}"
            message = template.format(type(ex).__name__, ex.args)
            logger.info('user={} action={} item="{}" param1="{}"'.format(user, form['action'], form['path'], form['param1']))
            logger.warn('caught error {} debug={}'.format(message, debug))
            return {'payload': {'reason': message, 'debug': debug}, 'status': 200}

