# Copyright (C) 2018 Chris Younger

[Help(http://path_to_answers)]

[Github(http://path_to_answers)]

[Splunkbase(http://path_to_answers)]



# to create repo
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

!! Will my changes be replicated through the cluster.
no, unless you are editing files on the deployer or whatever

!! where to find logging

!! Using an existing git repository

!! Tracking changes made outside of config_explorer

!! Setting what files are ignored for git

!! Pushing to a remote git repository

!! Running in Docker
You will probably need to rebuild your container with git support like so:
`RUN apt-get -qq update && apt-get install --no-install-recommends -qqy curl ca-certificates git`
