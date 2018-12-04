# Config Explorer
 
This app provides a modern editor interface for viewing and editing Splunk files. It has code completion and 
tooltip hinting for '.conf' files from the Splunk '.spec' files. The code gutter shows indicators highlighting if
the line can be found in the btool output or not.  By default, the app is not able to save files, but this can
be enabled from the "Settings" link. As this app essentially provides unrestricted access to the Splunk files, 
users must have "admin_all_objects" capability. The editor is Microsoft Monaco editor (Visual Studio Code).

This app can optionally version control all changes by committing them to a git repository before and after 
saving. To use this you need to have "git" installed (not provided by this app) and you also need to setup 
a git repository.
  
   
## Important warnings:

* Don't use this app on Search Head clusters becuase it won't sync changes to cluster members. 
* As a matter of fact, because this app allows changing files just like you are on the filesystem, it should be 
used very carefully in any environment that you care about. 
* There are no built-in restrictions on viewing secrets files or passwords. Don't make this app available to 
users who should not see that sort of things.
* There are also no restrictions that prevent editing files in `default/` folders. You should follow normal Splunk 
best practices and only edit the `/local/*.conf` files or files in `default/` if you are the developer of that app.
* This app inherits the permissions of the user account that is running Splunk.
* By the way, all Splunk apps inherit the permissions of the Splunk user and can do things without your knowing. If 
you care about your Splunk instance, you should code review all apps before installing them.


There is some basic audit logging here: `index=_internal source="*config_explorer.log"`


Copyright (C) 2018 Chris Younger
I am a Splunk Professional Services consultant working for JDS Australia (www.jds.net.au), in Brisbane Australia. 


[Source code(https://github.com/ChrisYounger/config_explorer)] 

[Feature requests and bugs(https://github.com/ChrisYounger/config_explorer/issues)] 

[Splunkbase(http://path_to_splunkbase)]


  
# Enabling git auto-commit
export GIT_DIR=/opt/splunk/.git/
export GIT_WORK_TREE=/opt/splunk/
git init
Set a username and email address for config_explorer to use for commits
git config user.name config_explorer
git config user.email config_explorer@splunk.splunk  
Optionally connect to a remote repository:

Optionally create a scheduled job to push changes to remote repository:

Optionally set a scheduled job to add and commit changes that happen outside of  config_explorer

# Settings on repo can be changed here: ./etc/apps/config_explorer/git/config

# To check size of repo, run this: "du -sh $GIT_DIR"

! to enable scheduled sync of git changes to remote repository, do this:
1. run git remote set-url origin http://USERNAME:PASSWORD@REMOTE_URL/pathto/repo.git
2. create a file: `./etc/apps/config_explorer/local/inputs.conf`
3. copy contents from `/etc/apps/config_explorer/default/inputs.conf`
4. set `enable = true`


!! Using an existing git repository

!! Tracking changes made outside of config_explorer

!! Setting what files are ignored for git

!! Pushing to a remote git repository
