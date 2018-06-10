# Copyright (C) 2018 Chris Younger

[Help(http://path_to_answers)]
[Github(http://path_to_answers)]
[Splunkbase(http://path_to_answers)]

# my doco
https://github.com/Microsoft/monaco-editor
https://github.com/Microsoft/monaco-editor-samples
when changing HTML file: https://cyounger.pw:8089/servicesNS/nobody/config_editor/data/ui/views/_reload
my repo: https://git.cyounger.pw/home/splunk-home
logging: https://cyounger.pw/en-GB/app/search/search?q=search%20index%3D_internal%20config_editor%20git%20push&display.page.search.mode=verbose&dispatch.sample_ratio=1&earliest=-24h%40h&latest=now&display.page.search.tab=events&display.general.type=events&display.events.type=list&display.events.fields=%5B%22latency%22%2C%22place.name%22%2C%22upstreamCurrRate%22%2C%22downstreamCurrRate%22%2C%22Status%22%2C%22FriendlyName%22%2C%22IP%22%2C%22Path%22%2C%22Method%22%2C%22process%22%2C%22notes%22%2C%22details%22%2C%22date%22%2C%22insertdate%22%2C%22card%22%2C%22category%22%2C%22value%22%2C%22activities%7B%7D.activity%22%2C%22activities%7B%7D.duration%22%2C%22activities%7B%7D.startTime%22%2C%22startTime%22%2C%22place.location.lat%22%2C%22place.location.lon%22%2C%22from%22%2C%22subject%22%2C%22kc%22%2C%22position%22%2C%22chromosome%22%2C%22genotype%22%2C%22ServiceType%22%2C%22source%22%2C%22sourcetype%22%5D&sid=1528143032.5999
logging as table: https://cyounger.pw/en-GB/app/search/search?q=search%20index%3D_internal%20config_editor%20source%3D%22%2Fopt%2Fsplunk%2Fvar%2Flog%2Fsplunk%2Fpython.log%22%20%0A%7C%20%20table%20_time%20user%20action%20path%20param1%20reason&display.page.search.mode=verbose&dispatch.sample_ratio=1&earliest=-24h%40h&latest=now&display.page.search.tab=statistics&display.general.type=statistics&display.events.type=list&display.events.fields=%5B%22latency%22%2C%22place.name%22%2C%22upstreamCurrRate%22%2C%22downstreamCurrRate%22%2C%22Status%22%2C%22FriendlyName%22%2C%22IP%22%2C%22Path%22%2C%22Method%22%2C%22process%22%2C%22notes%22%2C%22details%22%2C%22date%22%2C%22insertdate%22%2C%22card%22%2C%22category%22%2C%22value%22%2C%22activities%7B%7D.activity%22%2C%22activities%7B%7D.duration%22%2C%22activities%7B%7D.startTime%22%2C%22startTime%22%2C%22place.location.lat%22%2C%22place.location.lon%22%2C%22from%22%2C%22subject%22%2C%22kc%22%2C%22position%22%2C%22chromosome%22%2C%22genotype%22%2C%22ServiceType%22%2C%22source%22%2C%22sourcetype%22%5D&sid=1528144874.6091

# to create repo
git init
Set a username and email address for config_editor to use for commits
git config user.name config_editor
git config user.email config_editor@splunk.splunk
Optionally connect to a remote repository:

Optionally create a scheduled job to push changes to remote repository:

Optionally set a scheduled job to add and commit changes that happen outside of  config_editor

# Settings on repo can be changed here: ./etc/apps/config_editor/git/config

# To check size of repo, run this: "du -sh $GIT_DIR"

! to enable scheduled sync of git changes to remote repository, do this:
1. run git remote set-url origin http://USERNAME:PASSWORD@REMOTE_URL/pathto/repo.git
2. create a file: `./etc/apps/config_editor/local/inputs.conf`
3. copy contents from `/etc/apps/config_editor/default/inputs.conf`
4. set `enable = true`

!! where to find logging

!! Using an existing git repository

!! Tracking changes made outside of config_editor

!! Setting what files are ignored for git

!! Pushing to a remote git repository

!! Running in Docker
You will probably need to rebuild your container with git support like so:
`RUN apt-get -qq update && apt-get install --no-install-recommends -qqy curl ca-certificates git`