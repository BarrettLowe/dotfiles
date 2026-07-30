# syntax=docker/dockerfile:1.4
#
# Builds Barrett's personal dev toolchain (Neovim/Tmux/zsh/uv/nvm/etc., all
# provisioned by setup.sh) and layers it onto an arbitrary team base image.
#
# Usage:
#   docker build --build-arg TEAM_IMAGE=team/dev-image:latest -t yourname/dev-image .
#   docker build -t yourname/dev-image .          # defaults to plain ubuntu:24.04
#
# Why two stages:
#   Stage "toolchain" is pinned to a stable, unrelated base (ubuntu:24.04), so
#   its layers are NOT invalidated when TEAM_IMAGE changes -- only when this
#   Dockerfile/setup.sh/dotfiles actually change. Stage "final" starts FROM
#   the team's image and only COPYs the already-built artifacts across, which
#   is cheap regardless of how often the team ships a new base image. See
#   setup.sh's Step 3 comments for why apt (not Homebrew) is used here --
#   this Dockerfile assumes a root-friendly context, so apt is fine.
#
# Customize for your setup:
#   - HOME_DIR below assumes the final image's user is root (HOME=/root).
#     If TEAM_IMAGE runs as a non-root user (e.g. "vscode"), override
#     HOME_DIR at build time to match, and make sure that user owns the
#     copied paths (add a `chown -R` after the COPY instructions).

ARG TEAM_IMAGE=gitlab.oksi.ai/program-families/armgdnfamily/armgdn-seeker-sw:amd64
ARG HOME_DIR=/home/developer

# ---------------------------------------------------------------------------
# Stage 1: toolchain -- pinned base; only rebuilds when setup.sh/dotfiles change
# ---------------------------------------------------------------------------
FROM ubuntu:22.04 AS toolchain
ARG HOME_DIR
ENV DEBIAN_FRONTEND=noninteractive \
    HOME=${HOME_DIR}

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl git unzip tar zsh tmux sudo luarocks wl-clipboard
# NOTE: do NOT rm -rf /var/lib/apt/lists/* above -- the final
# stage copies /var/lib/apt and /var/cache/apt from this stage,
# so apt-get install in the final stage works fully offline.

RUN git clone https://github.com/barrettlowe/dotfiles ${HOME_DIR}/dotfiles && echo `Donesky`

WORKDIR ${HOME_DIR}/dotfiles

# Cache mounts keep downloaded artifacts warm across rebuilds of this stage
# even when a dotfiles edit invalidates the RUN layer itself.
RUN --mount=type=cache,target=${HOME_DIR}/.build \
    --mount=type=cache,target=${HOME_DIR}/.cache \
    bash setup.sh

# ---------------------------------------------------------------------------
# Stage 2: final -- whatever the team ships, with the toolchain copied on top
# ---------------------------------------------------------------------------
FROM ${TEAM_IMAGE} AS final
ARG HOME_DIR
ENV HOME=${HOME_DIR} \
    TERM=xterm-256color \
    COLORTERM=truecolor
WORKDIR ${HOME_DIR}/dotfiles

# The dotfiles repo itself: most of setup.sh's symlinks point back into it
# (e.g. ~/.zshrc -> dotfiles/.zshrc), so this has to come along too.
COPY --from=toolchain ${HOME_DIR}/dotfiles ${HOME_DIR}/dotfiles

# The expensive, network-fetched artifacts -- this is the part that would be
# slow to reprovision on every rebuild, so we copy it instead of reinstalling.
COPY --from=toolchain ${HOME_DIR}/DevTools   ${HOME_DIR}/DevTools
COPY --from=toolchain ${HOME_DIR}/.local     ${HOME_DIR}/.local
COPY --from=toolchain ${HOME_DIR}/.oh-my-zsh ${HOME_DIR}/.oh-my-zsh
COPY --from=toolchain ${HOME_DIR}/.nvm       ${HOME_DIR}/.nvm

# apt cache + package lists from the toolchain stage -- makes the install
# in this stage fully offline (no network, no downloads, no apt-get update).
COPY --from=toolchain /var/lib/apt /var/lib/apt
COPY --from=toolchain /var/cache/apt /var/cache/apt

RUN apt-get install -y --no-install-recommends \
        ca-certificates curl git unzip tar zsh tmux sudo luarocks wl-clipboard \
    && rm -rf /var/lib/apt/lists/*

# Re-running setup.sh here is cheap: every install in it is gated by a
# `command -v` / `[ -d ... ]` check, so with everything above already in
# place it just wires up symlinks and the Claude/pi config sync -- no
# re-downloads, no apt, no network.

RUN chown -R developer:developer /home/developer
RUN chsh --shell /usr/bin/zsh developer

USER developer
WORKDIR ${HOME_DIR}/dotfiles
RUN bash setup.sh && echo "Setup.sh ran"

CMD ["/bin/zsh"]
