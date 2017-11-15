#!/bin/bash -ex

USERNAME=root
HOSTNAME=build.danstutzman.com
TARGET_PATH=/root/gopath/src/github.com/danielstutzman/sync-log-files-to-db/
SSH_KEY=/Users/dan/.ssh/vultr

git status --porcelain --ignored \
  | sed 's/^.. //' \
  | xargs -J {} \
    rsync -r --rsh="ssh -i $SSH_KEY" \
     --exclude=backed_up -z \
     --no-owner --force --relative --delete-missing-args \
      .git/ {} $USERNAME@$HOSTNAME:$TARGET_PATH || \
  if [ "$?" != 0 ]; then
    if [ $(ssh -i $SSH_KEY $USERNAME@$HOSTNAME "[ -e $TARGET_PATH ]; echo \$?") == 1 ]; then
      # If it's the first time, do some setup and full rsync
      ssh -i $SSH_KEY $USERNAME@$HOSTNAME <<EOF
        set -ex
        mkdir -p $TARGET_PATH

        if [ ! -e go1.9.2.linux-amd64.tar.gz ]; then
          curl -o go1.9.2.linux-amd64.tar.gz \
            https://storage.googleapis.com/golang/go1.9.2.linux-amd64.tar.gz
        fi
        if [ ! -e go ]; then
          tar xzf go1.9.2.linux-amd64.tar.gz
        fi
EOF
      rsync -r --rsh="ssh -i $SSH_KEY" -z --progress --exclude=backed_up \
        --no-owner --force --relative --delete-missing-args ./ \
        $USERNAME@$HOSTNAME:$TARGET_PATH
    else
      exit 1
    fi
  fi

ssh -i $SSH_KEY $USERNAME@$HOSTNAME <<EOF
  set -ex

  cd $TARGET_PATH
  GOPATH=/root/gopath CGO_ENABLED=0 \
    /root/go/bin/go install -tags netgo -v -ldflags="-s -w" ./...

  ldd /root/gopath/bin/sync-log-files-to-db | grep -q "not a dynamic executable"
  git diff

  docker ps -a -f ancestor=sync-log-files-to-db --format={{.ID}} \
      | xargs --no-run-if-empty docker stop
  sleep 0.5
  docker ps -a -f ancestor=sync-log-files-to-db --format={{.ID}} \
      | xargs --no-run-if-empty docker rm
  docker image ls sync-log-files-to-db | grep -q latest && \
      docker rmi sync-log-files-to-db
  cp /root/gopath/bin/sync-log-files-to-db $TARGET_PATH/sync-log-files-to-db
  docker build $TARGET_PATH -t sync-log-files-to-db
EOF
