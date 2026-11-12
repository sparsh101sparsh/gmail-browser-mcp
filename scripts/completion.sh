#!/usr/bin/env bash
# Shell completion for scripts/fast_mail.py (Bash & Zsh compatible)

_fast_mail_completions() {
    local cur prev subcommands
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"
    subcommands="send search read stats check login daemon metrics doctor"

    if [ "$COMP_CWORD" -eq 1 ]; then
        COMPREPLY=( $(compgen -W "${subcommands}" -- "$cur") )
        return 0
    fi

    case "$prev" in
        daemon)
            COMPREPLY=( $(compgen -W "start stop status" -- "$cur") )
            return 0
            ;;
        --to|--cc|--bcc)
            return 0
            ;;
        --subject|--body)
            return 0
            ;;
        send)
            COMPREPLY=( $(compgen -W "--to --subject --body --html --cc --bcc --attachment" -- "$cur") )
            return 0
            ;;
        search)
            COMPREPLY=( $(compgen -W "--query --from --to --subject --unread --limit" -- "$cur") )
            return 0
            ;;
        read)
            COMPREPLY=( $(compgen -W "--thread-id --query" -- "$cur") )
            return 0
            ;;
        *)
            ;;
    esac
}

complete -F _fast_mail_completions python3 scripts/fast_mail.py
complete -F _fast_mail_completions fast_mail.py
