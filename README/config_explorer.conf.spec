write_access = <bool>
* This enables saving, creating new files/folders, deleting and renaming. This
  is obviously very dangerous and just like having filesystem access through
  the operating system, will make it very easy to destroy your Splunk 
  environment if you dont know what you are doing. 
  Defaults to false

run_commands = <bool>
* Enables running commands in the shell, with the user that splunk runs as.
  if you thought being able to edit the filesystem was dangerous, then this 
  is really going to rustle your jimmies. 
  Defaults to false

lock_config = <bool>
* Setting this to true will lock the config and it will not be possible to 
  change it without going onto the filesystem and changing it there. You must 
  also set enable_write to false. 
  Defaults to false

max_file_size = 10
* The maximum file size in megabytes that can be opened. 

############################################################################
#  Experimental features                                                   #
############################################################################

git = <bool>
* Enable tracking of changes using git.  
  Defaults to false 

git_dir = <string>
* The location of the git repository, relative to SPLUNK_HOME directory.
  Defaults to etc/apps/config_explorer/git

git_work_tree = <string>
* Root location from where changes are tracked, relative to SPLUNK_HOME directory
  Defaults to .

running_config = <bool>
* Enable diffing of the effective btool configuration against what is currently
  running in Splunk.
  Defaults to false

conf_validate_on_save = <bool>
* Show a green or red indicator in the code gutter of each line if it appears
  in the btool list output or not
  Defaults to true
