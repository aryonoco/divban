# SPDX-License-Identifier: 0BSD
# Copyright (c) 2023-2026 Aryan Ameri
#
# Powerlevel10k Lean ASCII Configuration

'builtin' 'local' '-a' 'p10k_config_opts'
[[ ! -o 'aliases'         ]] || p10k_config_opts+=('aliases')
[[ ! -o 'sh_glob'         ]] || p10k_config_opts+=('sh_glob')
[[ ! -o 'no_brace_expand' ]] || p10k_config_opts+=('no_brace_expand')
'builtin' 'setopt' 'no_aliases' 'no_sh_glob' 'brace_expand'

() {
  emulate -L zsh -o extended_glob

  unset -m '(POWERLEVEL9K_*|DEFAULT_USER)~POWERLEVEL9K_GITSTATUS_DIR'

  # ASCII mode
  typeset -g POWERLEVEL9K_MODE=ascii

  # Left prompt elements
  typeset -g POWERLEVEL9K_LEFT_PROMPT_ELEMENTS=(
    dir                     # current directory
    vcs                     # git status
  )

  # Right prompt elements
  typeset -g POWERLEVEL9K_RIGHT_PROMPT_ELEMENTS=(
    status                  # exit code of last command
    command_execution_time  # duration of last command
    background_jobs         # background jobs indicator
    context                 # user@hostname (SSH only)
  )

  # Basic styling
  typeset -g POWERLEVEL9K_BACKGROUND=                            # transparent background
  typeset -g POWERLEVEL9K_LEFT_SUBSEGMENT_SEPARATOR=' '
  typeset -g POWERLEVEL9K_RIGHT_SUBSEGMENT_SEPARATOR=' '
  typeset -g POWERLEVEL9K_LEFT_SEGMENT_SEPARATOR=''
  typeset -g POWERLEVEL9K_RIGHT_SEGMENT_SEPARATOR=''
  typeset -g POWERLEVEL9K_LEFT_PROMPT_LAST_SEGMENT_END_SYMBOL=''
  typeset -g POWERLEVEL9K_RIGHT_PROMPT_FIRST_SEGMENT_START_SYMBOL=''
  typeset -g POWERLEVEL9K_LEFT_PROMPT_FIRST_SEGMENT_START_SYMBOL=''
  typeset -g POWERLEVEL9K_RIGHT_PROMPT_LAST_SEGMENT_END_SYMBOL=''
  typeset -g POWERLEVEL9K_EMPTY_LINE_LEFT_PROMPT_LAST_SEGMENT_END_SYMBOL=

  # Prompt settings
  typeset -g POWERLEVEL9K_PROMPT_ADD_NEWLINE=true
  typeset -g POWERLEVEL9K_MULTILINE_FIRST_PROMPT_PREFIX=
  typeset -g POWERLEVEL9K_MULTILINE_NEWLINE_PROMPT_PREFIX=
  typeset -g POWERLEVEL9K_MULTILINE_LAST_PROMPT_PREFIX=
  typeset -g POWERLEVEL9K_MULTILINE_FIRST_PROMPT_SUFFIX=
  typeset -g POWERLEVEL9K_MULTILINE_NEWLINE_PROMPT_SUFFIX=
  typeset -g POWERLEVEL9K_MULTILINE_LAST_PROMPT_SUFFIX=
  typeset -g POWERLEVEL9K_MULTILINE_FIRST_PROMPT_GAP_CHAR=' '

  # Prompt character: > for normal, < for vi command mode
  typeset -g POWERLEVEL9K_PROMPT_CHAR_OK_{VIINS,VICMD,VIVIS,VIOWR}_FOREGROUND=2
  typeset -g POWERLEVEL9K_PROMPT_CHAR_ERROR_{VIINS,VICMD,VIVIS,VIOWR}_FOREGROUND=1
  typeset -g POWERLEVEL9K_PROMPT_CHAR_{OK,ERROR}_VIINS_CONTENT_EXPANSION='>'
  typeset -g POWERLEVEL9K_PROMPT_CHAR_{OK,ERROR}_VICMD_CONTENT_EXPANSION='<'
  typeset -g POWERLEVEL9K_PROMPT_CHAR_{OK,ERROR}_VIVIS_CONTENT_EXPANSION='V'
  typeset -g POWERLEVEL9K_PROMPT_CHAR_{OK,ERROR}_VIOWR_CONTENT_EXPANSION='^'
  typeset -g POWERLEVEL9K_PROMPT_CHAR_OVERWRITE_STATE=true
  typeset -g POWERLEVEL9K_PROMPT_CHAR_LEFT_PROMPT_LAST_SEGMENT_END_SYMBOL=''
  typeset -g POWERLEVEL9K_PROMPT_CHAR_LEFT_PROMPT_FIRST_SEGMENT_START_SYMBOL=

  # Directory settings
  typeset -g POWERLEVEL9K_DIR_FOREGROUND=4
  typeset -g POWERLEVEL9K_SHORTEN_STRATEGY=truncate_to_unique
  typeset -g POWERLEVEL9K_SHORTEN_DELIMITER='..'
  typeset -g POWERLEVEL9K_DIR_SHORTENED_FOREGROUND=4
  typeset -g POWERLEVEL9K_DIR_ANCHOR_FOREGROUND=4
  typeset -g POWERLEVEL9K_DIR_ANCHOR_BOLD=false
  typeset -g POWERLEVEL9K_DIR_MAX_LENGTH=40
  typeset -g POWERLEVEL9K_SHORTEN_DIR_LENGTH=1
  typeset -g POWERLEVEL9K_DIR_SHOW_WRITABLE=v3

  # Git/VCS settings (ASCII characters only)
  typeset -g POWERLEVEL9K_VCS_BRANCH_ICON=
  typeset -g POWERLEVEL9K_VCS_UNTRACKED_ICON='?'
  typeset -g POWERLEVEL9K_VCS_UNSTAGED_ICON='!'
  typeset -g POWERLEVEL9K_VCS_STAGED_ICON='+'
  typeset -g POWERLEVEL9K_VCS_STASH_ICON='*'
  typeset -g POWERLEVEL9K_VCS_INCOMING_CHANGES_ICON='<'
  typeset -g POWERLEVEL9K_VCS_OUTGOING_CHANGES_ICON='>'
  typeset -g POWERLEVEL9K_VCS_TAG_ICON='#'
  typeset -g POWERLEVEL9K_VCS_COMMIT_ICON='@'

  # VCS colours
  typeset -g POWERLEVEL9K_VCS_CLEAN_FOREGROUND=2
  typeset -g POWERLEVEL9K_VCS_UNTRACKED_FOREGROUND=4
  typeset -g POWERLEVEL9K_VCS_MODIFIED_FOREGROUND=3

  # VCS content formatting
  typeset -g POWERLEVEL9K_VCS_BACKENDS=(git)
  typeset -g POWERLEVEL9K_VCS_LOADING_TEXT=

  # Disable git status for large repos (performance)
  typeset -g POWERLEVEL9K_VCS_MAX_INDEX_SIZE_DIRTY=4096

  # Command execution time
  typeset -g POWERLEVEL9K_COMMAND_EXECUTION_TIME_THRESHOLD=3
  typeset -g POWERLEVEL9K_COMMAND_EXECUTION_TIME_PRECISION=0
  typeset -g POWERLEVEL9K_COMMAND_EXECUTION_TIME_FOREGROUND=5
  typeset -g POWERLEVEL9K_COMMAND_EXECUTION_TIME_FORMAT='d h m s'
  typeset -g POWERLEVEL9K_COMMAND_EXECUTION_TIME_PREFIX='['
  typeset -g POWERLEVEL9K_COMMAND_EXECUTION_TIME_SUFFIX=']'

  # Background jobs
  typeset -g POWERLEVEL9K_BACKGROUND_JOBS_VERBOSE=false
  typeset -g POWERLEVEL9K_BACKGROUND_JOBS_FOREGROUND=6
  typeset -g POWERLEVEL9K_BACKGROUND_JOBS_ICON='&'

  # Exit status
  typeset -g POWERLEVEL9K_STATUS_EXTENDED_STATES=true
  typeset -g POWERLEVEL9K_STATUS_OK=false
  typeset -g POWERLEVEL9K_STATUS_OK_FOREGROUND=2
  typeset -g POWERLEVEL9K_STATUS_OK_PIPE=true
  typeset -g POWERLEVEL9K_STATUS_OK_PIPE_FOREGROUND=2
  typeset -g POWERLEVEL9K_STATUS_ERROR=true
  typeset -g POWERLEVEL9K_STATUS_ERROR_FOREGROUND=1
  typeset -g POWERLEVEL9K_STATUS_ERROR_SIGNAL=true
  typeset -g POWERLEVEL9K_STATUS_ERROR_SIGNAL_FOREGROUND=1
  typeset -g POWERLEVEL9K_STATUS_ERROR_PIPE=true
  typeset -g POWERLEVEL9K_STATUS_ERROR_PIPE_FOREGROUND=1
  typeset -g POWERLEVEL9K_STATUS_VERBOSE_SIGNAME=false
  typeset -g POWERLEVEL9K_STATUS_OK_VISUAL_IDENTIFIER_EXPANSION=
  typeset -g POWERLEVEL9K_STATUS_OK_PIPE_VISUAL_IDENTIFIER_EXPANSION=
  typeset -g POWERLEVEL9K_STATUS_ERROR_VISUAL_IDENTIFIER_EXPANSION='x'
  typeset -g POWERLEVEL9K_STATUS_ERROR_SIGNAL_VISUAL_IDENTIFIER_EXPANSION='x'
  typeset -g POWERLEVEL9K_STATUS_ERROR_PIPE_VISUAL_IDENTIFIER_EXPANSION='x'

  # Context (user@host) - only show in SSH sessions
  typeset -g POWERLEVEL9K_CONTEXT_FOREGROUND=7
  typeset -g POWERLEVEL9K_CONTEXT_ROOT_FOREGROUND=1
  typeset -g POWERLEVEL9K_CONTEXT_{DEFAULT,SUDO}_{CONTENT,VISUAL_IDENTIFIER}_EXPANSION=
  typeset -g POWERLEVEL9K_CONTEXT_REMOTE_FOREGROUND=7
  typeset -g POWERLEVEL9K_CONTEXT_{REMOTE,REMOTE_SUDO}_CONTENT_EXPANSION='%n@%m'
  typeset -g POWERLEVEL9K_CONTEXT_PREFIX=

  # Transient prompt
  typeset -g POWERLEVEL9K_TRANSIENT_PROMPT=off

  # Instant prompt mode
  typeset -g POWERLEVEL9K_INSTANT_PROMPT=verbose

  # Hot reload (disabled for performance)
  typeset -g POWERLEVEL9K_DISABLE_HOT_RELOAD=true

  # Gitstatus settings
  typeset -g POWERLEVEL9K_GITSTATUS_DIR=${GITSTATUS_DIR:-$POWERLEVEL9K_GITSTATUS_DIR}
  typeset -g POWERLEVEL9K_VCS_DISABLE_GITSTATUS_FORMATTING=true
  typeset -g POWERLEVEL9K_VCS_CONTENT_EXPANSION='${$((my_git_format()))+${my_git_format}}'

  # Git formatting function
  function my_git_format() {
    emulate -L zsh

    if [[ -n $P9K_CONTENT ]]; then
      typeset -g my_git_format=$P9K_CONTENT
      return
    fi

    local res
    local where

    if [[ -n $VCS_STATUS_LOCAL_BRANCH ]]; then
      where=$VCS_STATUS_LOCAL_BRANCH
    elif [[ -n $VCS_STATUS_TAG ]]; then
      where="#${VCS_STATUS_TAG}"
    else
      where="@${VCS_STATUS_COMMIT[1,8]}"
    fi

    res+="${clean:-${modified:-${untracked:-$where}}}"
    [[ -z $where ]] && res+="${VCS_STATUS_ACTION:+ $VCS_STATUS_ACTION}"

    if [[ -n $VCS_STATUS_LOCAL_BRANCH ]]; then
      res+=$where
    elif [[ -n $VCS_STATUS_TAG ]]; then
      res+="#$VCS_STATUS_TAG"
    else
      res+="@${VCS_STATUS_COMMIT[1,8]}"
    fi

    [[ -n $VCS_STATUS_ACTION ]] && res+=" $VCS_STATUS_ACTION"
    (( VCS_STATUS_NUM_STAGED )) && res+=" +$VCS_STATUS_NUM_STAGED"
    (( VCS_STATUS_NUM_UNSTAGED )) && res+=" !$VCS_STATUS_NUM_UNSTAGED"
    (( VCS_STATUS_NUM_UNTRACKED )) && res+=" ?$VCS_STATUS_NUM_UNTRACKED"
    (( VCS_STATUS_STASHES )) && res+=" *$VCS_STATUS_STASHES"
    (( VCS_STATUS_COMMITS_BEHIND )) && res+=" <$VCS_STATUS_COMMITS_BEHIND"
    (( VCS_STATUS_COMMITS_AHEAD )) && res+=" >$VCS_STATUS_COMMITS_AHEAD"

    typeset -g my_git_format=$res
  }
  functions -M my_git_format 2>/dev/null

  (( ${#p10k_config_opts} )) && setopt ${p10k_config_opts[@]}
  'builtin' 'unset' 'p10k_config_opts'
}

# Ensure the theme is loaded
(( ! p10k_lean_restore_aliases )) || setopt aliases
'builtin' 'unset' 'p10k_lean_restore_aliases'
