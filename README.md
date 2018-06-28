# Copyright (C) 2018 Chris Younger

[Help(http://path_to_answers)]
[Github(http://path_to_answers)]
[Splunkbase(http://path_to_answers)]

# my doco
https://github.com/Microsoft/monaco-editor
https://github.com/Microsoft/monaco-editor-samples
when changing HTML file: https://cyounger.pw:8089/servicesNS/nobody/config_explorer/data/ui/views/_reload
my repo: https://git.cyounger.pw/home/splunk-home
logging: https://cyounger.pw/en-GB/app/search/search?q=search%20index%3D_internal%20config_explorer%20git%20push&display.page.search.mode=verbose&dispatch.sample_ratio=1&earliest=-24h%40h&latest=now&display.page.search.tab=events&display.general.type=events&display.events.type=list&display.events.fields=%5B%22latency%22%2C%22place.name%22%2C%22upstreamCurrRate%22%2C%22downstreamCurrRate%22%2C%22Status%22%2C%22FriendlyName%22%2C%22IP%22%2C%22Path%22%2C%22Method%22%2C%22process%22%2C%22notes%22%2C%22details%22%2C%22date%22%2C%22insertdate%22%2C%22card%22%2C%22category%22%2C%22value%22%2C%22activities%7B%7D.activity%22%2C%22activities%7B%7D.duration%22%2C%22activities%7B%7D.startTime%22%2C%22startTime%22%2C%22place.location.lat%22%2C%22place.location.lon%22%2C%22from%22%2C%22subject%22%2C%22kc%22%2C%22position%22%2C%22chromosome%22%2C%22genotype%22%2C%22ServiceType%22%2C%22source%22%2C%22sourcetype%22%5D&sid=1528143032.5999
logging as table: https://cyounger.pw/en-GB/app/search/search?q=search%20index%3D_internal%20config_explorer%20source%3D%22%2Fopt%2Fsplunk%2Fvar%2Flog%2Fsplunk%2Fpython.log%22%20%0A%7C%20%20table%20_time%20user%20action%20path%20param1%20reason&display.page.search.mode=verbose&dispatch.sample_ratio=1&earliest=-24h%40h&latest=now&display.page.search.tab=statistics&display.general.type=statistics&display.events.type=list&display.events.fields=%5B%22latency%22%2C%22place.name%22%2C%22upstreamCurrRate%22%2C%22downstreamCurrRate%22%2C%22Status%22%2C%22FriendlyName%22%2C%22IP%22%2C%22Path%22%2C%22Method%22%2C%22process%22%2C%22notes%22%2C%22details%22%2C%22date%22%2C%22insertdate%22%2C%22card%22%2C%22category%22%2C%22value%22%2C%22activities%7B%7D.activity%22%2C%22activities%7B%7D.duration%22%2C%22activities%7B%7D.startTime%22%2C%22startTime%22%2C%22place.location.lat%22%2C%22place.location.lon%22%2C%22from%22%2C%22subject%22%2C%22kc%22%2C%22position%22%2C%22chromosome%22%2C%22genotype%22%2C%22ServiceType%22%2C%22source%22%2C%22sourcetype%22%5D&sid=1528144874.6091

how to set a gitignore: https://answers.splunk.com/answers/216267/what-do-you-put-in-your-gitignore-file-for-a-syste.html

# run this
./bin/splunk ftw

# to create repo
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

!! To compile a splunk visualisation
`cd /opt/splunk/etc/apps/jds-arm/appserver/static/visualizations/blocks  && /opt/splunk/bin/splunk cmd node ./node_modules/webpack/bin/webpack.js`

!! run things
`./bin/splunk cmd python ./etc/apps/config_explorer/bin/run.py`
some change

find /opt/splunk/var/lib/splunk -name "*.tsidx"
./bin/splunk cmd walklex /opt/splunk/var/lib/splunk/index/db/db_1522759630_1522759390_0/1522759630-1522759390-2256855131967237431.tsidx  ""
./bin/splunk cmd walklex /opt/splunk/var/lib/splunk/index/db/db_1522759630_1522759390_0/1522759630-1522759390-2256855131967237431.tsidx  "*::*"



{
        /**
         * The aria label for the editor's textarea (when it is focused).
         */
        ariaLabel?: string;
        /**
         * Render vertical lines at the specified columns.
         * Defaults to empty array.
         */
        rulers?: number[];
        /**
         * A string containing the word separators used when doing word navigation.
         * Defaults to `~!@#$%^&*()-=+[{]}\\|;:\'",.<>/?
         */
        wordSeparators?: string;
        /**
         * Enable Linux primary clipboard.
         * Defaults to true.
         */
        selectionClipboard?: boolean;
        /**
         * Control the rendering of line numbers.
         * If it is a function, it will be invoked when rendering a line number and the return value will be rendered.
         * Otherwise, if it is a truey, line numbers will be rendered normally (equivalent of using an identity function).
         * Otherwise, line numbers will not be rendered.
         * Defaults to true.
         */
        lineNumbers?: 'on' | 'off' | 'relative' | 'interval' | ((lineNumber: number) => string);
        /**
         * Should the corresponding line be selected when clicking on the line number?
         * Defaults to true.
         */
        selectOnLineNumbers?: boolean;
        /**
         * Control the width of line numbers, by reserving horizontal space for rendering at least an amount of digits.
         * Defaults to 5.
         */
        lineNumbersMinChars?: number;
        /**
         * Enable the rendering of the glyph margin.
         * Defaults to true in vscode and to false in monaco-editor.
         */
        glyphMargin?: boolean;
        /**
         * The width reserved for line decorations (in px).
         * Line decorations are placed between line numbers and the editor content.
         * You can pass in a string in the format floating point followed by "ch". e.g. 1.3ch.
         * Defaults to 10.
         */
        lineDecorationsWidth?: number | string;
        /**
         * When revealing the cursor, a virtual padding (px) is added to the cursor, turning it into a rectangle.
         * This virtual padding ensures that the cursor gets revealed before hitting the edge of the viewport.
         * Defaults to 30 (px).
         */
        revealHorizontalRightPadding?: number;
        /**
         * Render the editor selection with rounded borders.
         * Defaults to true.
         */
        roundedSelection?: boolean;
        /**
         * Class name to be added to the editor.
         */
        extraEditorClassName?: string;
        /**
         * Should the editor be read only.
         * Defaults to false.
         */
        readOnly?: boolean;
        /**
         * Control the behavior and rendering of the scrollbars.
         */
        scrollbar?: IEditorScrollbarOptions;
        /**
         * Control the behavior and rendering of the minimap.
         */
        minimap?: IEditorMinimapOptions;
        /**
         * Control the behavior of the find widget.
         */
        find?: IEditorFindOptions;
        /**
         * Display overflow widgets as `fixed`.
         * Defaults to `false`.
         */
        fixedOverflowWidgets?: boolean;
        /**
         * The number of vertical lanes the overview ruler should render.
         * Defaults to 2.
         */
        overviewRulerLanes?: number;
        /**
         * Controls if a border should be drawn around the overview ruler.
         * Defaults to `true`.
         */
        overviewRulerBorder?: boolean;
        /**
         * Control the cursor animation style, possible values are 'blink', 'smooth', 'phase', 'expand' and 'solid'.
         * Defaults to 'blink'.
         */
        cursorBlinking?: string;
        /**
         * Zoom the font in the editor when using the mouse wheel in combination with holding Ctrl.
         * Defaults to false.
         */
        mouseWheelZoom?: boolean;
        /**
         * Control the cursor style, either 'block' or 'line'.
         * Defaults to 'line'.
         */
        cursorStyle?: string;
        /**
         * Control the width of the cursor when cursorStyle is set to 'line'
         */
        cursorWidth?: number;
        /**
         * Enable font ligatures.
         * Defaults to false.
         */
        fontLigatures?: boolean;
        /**
         * Disable the use of `will-change` for the editor margin and lines layers.
         * The usage of `will-change` acts as a hint for browsers to create an extra layer.
         * Defaults to false.
         */
        disableLayerHinting?: boolean;
        /**
         * Disable the optimizations for monospace fonts.
         * Defaults to false.
         */
        disableMonospaceOptimizations?: boolean;
        /**
         * Should the cursor be hidden in the overview ruler.
         * Defaults to false.
         */
        hideCursorInOverviewRuler?: boolean;
        /**
         * Enable that scrolling can go one screen size after the last line.
         * Defaults to true.
         */
        scrollBeyondLastLine?: boolean;
        /**
         * Enable that the editor animates scrolling to a position.
         * Defaults to false.
         */
        smoothScrolling?: boolean;
        /**
         * Enable that the editor will install an interval to check if its container dom node size has changed.
         * Enabling this might have a severe performance impact.
         * Defaults to false.
         */
        automaticLayout?: boolean;
        /**
         * Control the wrapping of the editor.
         * When `wordWrap` = "off", the lines will never wrap.
         * When `wordWrap` = "on", the lines will wrap at the viewport width.
         * When `wordWrap` = "wordWrapColumn", the lines will wrap at `wordWrapColumn`.
         * When `wordWrap` = "bounded", the lines will wrap at min(viewport width, wordWrapColumn).
         * Defaults to "off".
         */
        wordWrap?: 'off' | 'on' | 'wordWrapColumn' | 'bounded';
        /**
         * Control the wrapping of the editor.
         * When `wordWrap` = "off", the lines will never wrap.
         * When `wordWrap` = "on", the lines will wrap at the viewport width.
         * When `wordWrap` = "wordWrapColumn", the lines will wrap at `wordWrapColumn`.
         * When `wordWrap` = "bounded", the lines will wrap at min(viewport width, wordWrapColumn).
         * Defaults to 80.
         */
        wordWrapColumn?: number;
        /**
         * Force word wrapping when the text appears to be of a minified/generated file.
         * Defaults to true.
         */
        wordWrapMinified?: boolean;
        /**
         * Control indentation of wrapped lines. Can be: 'none', 'same' or 'indent'.
         * Defaults to 'same' in vscode and to 'none' in monaco-editor.
         */
        wrappingIndent?: string;
        /**
         * Configure word wrapping characters. A break will be introduced before these characters.
         * Defaults to '{([+'.
         */
        wordWrapBreakBeforeCharacters?: string;
        /**
         * Configure word wrapping characters. A break will be introduced after these characters.
         * Defaults to ' \t})]?|&,;'.
         */
        wordWrapBreakAfterCharacters?: string;
        /**
         * Configure word wrapping characters. A break will be introduced after these characters only if no `wordWrapBreakBeforeCharacters` or `wordWrapBreakAfterCharacters` were found.
         * Defaults to '.'.
         */
        wordWrapBreakObtrusiveCharacters?: string;
        /**
         * Performance guard: Stop rendering a line after x characters.
         * Defaults to 10000.
         * Use -1 to never stop rendering
         */
        stopRenderingLineAfter?: number;
        /**
         * Enable hover.
         * Defaults to true.
         */
        hover?: boolean;
        /**
         * Enable detecting links and making them clickable.
         * Defaults to true.
         */
        links?: boolean;
        /**
         * Enable inline color decorators and color picker rendering.
         */
        colorDecorators?: boolean;
        /**
         * Enable custom contextmenu.
         * Defaults to true.
         */
        contextmenu?: boolean;
        /**
         * A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events.
         * Defaults to 1.
         */
        mouseWheelScrollSensitivity?: number;
        /**
         * The modifier to be used to add multiple cursors with the mouse.
         * Defaults to 'alt'
         */
        multiCursorModifier?: 'ctrlCmd' | 'alt';
        /**
         * Merge overlapping selections.
         * Defaults to true
         */
        multiCursorMergeOverlapping?: boolean;
        /**
         * Configure the editor's accessibility support.
         * Defaults to 'auto'. It is best to leave this to 'auto'.
         */
        accessibilitySupport?: 'auto' | 'off' | 'on';
        /**
         * Enable quick suggestions (shadow suggestions)
         * Defaults to true.
         */
        quickSuggestions?: boolean | {
            other: boolean;
            comments: boolean;
            strings: boolean;
        };
        /**
         * Quick suggestions show delay (in ms)
         * Defaults to 500 (ms)
         */
        quickSuggestionsDelay?: number;
        /**
         * Enables parameter hints
         */
        parameterHints?: boolean;
        /**
         * Render icons in suggestions box.
         * Defaults to true.
         */
        iconsInSuggestions?: boolean;
        /**
         * Enable auto closing brackets.
         * Defaults to true.
         */
        autoClosingBrackets?: boolean;
        /**
         * Enable auto indentation adjustment.
         * Defaults to false.
         */
        autoIndent?: boolean;
        /**
         * Enable format on type.
         * Defaults to false.
         */
        formatOnType?: boolean;
        /**
         * Enable format on paste.
         * Defaults to false.
         */
        formatOnPaste?: boolean;
        /**
         * Controls if the editor should allow to move selections via drag and drop.
         * Defaults to false.
         */
        dragAndDrop?: boolean;
        /**
         * Enable the suggestion box to pop-up on trigger characters.
         * Defaults to true.
         */
        suggestOnTriggerCharacters?: boolean;
        /**
         * Accept suggestions on ENTER.
         * Defaults to 'on'.
         */
        acceptSuggestionOnEnter?: boolean | 'on' | 'smart' | 'off';
        /**
         * Accept suggestions on provider defined characters.
         * Defaults to true.
         */
        acceptSuggestionOnCommitCharacter?: boolean;
        /**
         * Enable snippet suggestions. Default to 'true'.
         */
        snippetSuggestions?: 'top' | 'bottom' | 'inline' | 'none';
        /**
         * Copying without a selection copies the current line.
         */
        emptySelectionClipboard?: boolean;
        /**
         * Enable word based suggestions. Defaults to 'true'
         */
        wordBasedSuggestions?: boolean;
        /**
         * The history mode for suggestions.
         */
        suggestSelection?: 'first' | 'recentlyUsed' | 'recentlyUsedByPrefix';
        /**
         * The font size for the suggest widget.
         * Defaults to the editor font size.
         */
        suggestFontSize?: number;
        /**
         * The line height for the suggest widget.
         * Defaults to the editor line height.
         */
        suggestLineHeight?: number;
        /**
         * Enable selection highlight.
         * Defaults to true.
         */
        selectionHighlight?: boolean;
        /**
         * Enable semantic occurrences highlight.
         * Defaults to true.
         */
        occurrencesHighlight?: boolean;
        /**
         * Show code lens
         * Defaults to true.
         */
        codeLens?: boolean;
        /**
         * Control the behavior and rendering of the code action lightbulb.
         */
        lightbulb?: IEditorLightbulbOptions;
        /**
         * Code action kinds to be run on save.
         */
        codeActionsOnSave?: ICodeActionsOnSaveOptions;
        /**
         * Timeout for running code actions on save.
         */
        codeActionsOnSaveTimeout?: number;
        /**
         * Enable code folding
         * Defaults to true.
         */
        folding?: boolean;
        /**
         * Selects the folding strategy. 'auto' uses the strategies contributed for the current document, 'indentation' uses the indentation based folding strategy.
         * Defaults to 'auto'.
         */
        foldingStrategy?: 'auto' | 'indentation';
        /**
         * Controls whether the fold actions in the gutter stay always visible or hide unless the mouse is over the gutter.
         * Defaults to 'mouseover'.
         */
        showFoldingControls?: 'always' | 'mouseover';
        /**
         * Enable highlighting of matching brackets.
         * Defaults to true.
         */
        matchBrackets?: boolean;
        /**
         * Enable rendering of whitespace.
         * Defaults to none.
         */
        renderWhitespace?: 'none' | 'boundary' | 'all';
        /**
         * Enable rendering of control characters.
         * Defaults to false.
         */
        renderControlCharacters?: boolean;
        /**
         * Enable rendering of indent guides.
         * Defaults to false.
         */
        renderIndentGuides?: boolean;
        /**
         * Enable rendering of current line highlight.
         * Defaults to all.
         */
        renderLineHighlight?: 'none' | 'gutter' | 'line' | 'all';
        /**
         * Inserting and deleting whitespace follows tab stops.
         */
        useTabStops?: boolean;
        /**
         * The font family
         */
        fontFamily?: string;
        /**
         * The font weight
         */
        fontWeight?: 'normal' | 'bold' | 'bolder' | 'lighter' | 'initial' | 'inherit' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
        /**
         * The font size
         */
        fontSize?: number;
        /**
         * The line height
         */
        lineHeight?: number;
        /**
         * The letter spacing
         */
        letterSpacing?: number;
    }