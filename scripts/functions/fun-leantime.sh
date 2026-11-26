#!/usr/bin/env bash

# Leantime for the Webship Workspace: build a site of Leantime (the open-source project management software) from its
# own image, run Leantime's own console in its container, add its default accounts and their roles in a sample
# project, add its sample content, and wire its step pack into the testing setup.
#
# Placed by `plugins.sh --install leantime` in core/scripts/plugins/leantime/functions/, where bootstrap sources it
# after the core's own functions. Everything runs in containers, never on the host:
#   - DDEV (the default): Leantime's image is a service of a generic project, on the project's own MySQL (the db
#     service), at https://<name>.ddev.site; the project's web container keeps the mail catcher.
# Docker Compose, Podman, Kubernetes, Lando and Docksal are not proven yet: asked for one, the builder says so and
# changes nothing.
# The site's accounts and content go through Leantime's own code in its container (leantime-site.php): its console
# commands run in that process, and what they read (accounts, passwords) comes on its input, never on a command line.
#
# The container tool has no project type for Leantime, so a site of this plugin is recognised by a file on DDEV
# (.ddev/config.leantime.yaml, written by the builder).
# Four names are the ones the core's tools look for:
#   set_leantime_users          the default accounts                     (cmd-tools-add-users.sh <project> leantime)
#   add_leantime_users          make them, and their roles               (the same tool, and --add-users of the builder)
#   cancel_leantime_users       keep them from logging in                (cmd-tools-cancel-users.sh <project> leantime)
#   testing_configure_leantime  the step pack in the testing stack       (cmd-tools-testing.sh <project>)

# The step pack a site is tested with, and the release line it is required at.
readonly LEANTIME_STEPS_PACKAGE='@webship-js/leantime-steps';
readonly LEANTIME_STEPS_VERSION='^2.0.0';

# The release the builder runs when none is asked for (a tag of Leantime's image).
readonly LEANTIME_DEFAULT_RELEASE='3.17.0';

# The sample project the default accounts are members of, and the folder of a site with the plugin's scripts and the
# site's own values (its container reads them at /opt/webship).
readonly LEANTIME_PROJECT_NAME='Webship site';
readonly LEANTIME_FILES='leantime';

# The free memory a build asks for, in MB: Leantime's web server and PHP, beside MySQL.
readonly LEANTIME_MEMORY_MB=1536;

# The default accounts, the ones a scenario logs in as, each in a role of Leantime's: a Company Manager (owner), an
# Editor (member), a Commenter (commenter), a Read Only person (reader), all members of the sample project, and an
# Editor with no membership (stranger), whom the project is refused. Leantime logs in by e-mail address. Accounts are
# configuration, made once on the site; a test suite never creates or deletes one. The workspace account the builder
# makes with --install is the site's owner and is not in this list.
function set_leantime_users() {
  users=(owner member commenter reader stranger);
  local user ;
  for user in "${users[@]}" ; do
    printf -v "user_${user}_name" '%s' "${user}" ;
    printf -v "user_${user}_mail" '%s' "${user}@example.com" ;
    printf -v "user_${user}_password" '%s' 'dD.123123ddd' ;
    printf -v "user_${user}_first" '%s' "${user^}" ;
    printf -v "user_${user}_last" '%s' 'Test' ;
  done
  user_owner_role='manager' ; user_owner_member='yes' ;
  user_member_role='editor' ; user_member_member='yes' ;
  user_commenter_role='commenter' ; user_commenter_member='yes' ;
  user_reader_role='readonly' ; user_reader_member='yes' ;
  user_stranger_role='editor' ; user_stranger_member='' ;
}

# The runtime of the project in this folder, or of a new build (--runtime, else the workspace's setting, else DDEV).
# A core without the runtime layer has DDEV only.
function leantime_runtime() {
  if declare -f runtime_of > /dev/null ; then runtime_of "$@" ; else echo 'ddev' ; fi
}

# The address of the site in this folder (or of a new build named PROJECT_NAME, on DDEV).
function leantime_url() {
  echo "https://${1:-${PROJECT_NAME}}.ddev.site" ;
}

# Is this folder a Leantime site of this plugin? On DDEV the builder leaves .ddev/config.leantime.yaml in it.
function leantime_is_project() {
  local project_path="$1" ;
  [ -f "${project_path}/.ddev/config.leantime.yaml" ] && return 0 ;
  if declare -f rt_is_platform > /dev/null ; then rt_is_platform "${project_path}" leantime ; return $? ; fi
  return 1 ;
}

# Go to the project a tool was asked about, or say why not.
function leantime_enter_project() {
  local project_path="${WORKSPACE_ROOT}/${doc_name}/${PROJECT_NAME}";
  if [ ! -d "${project_path}" ] ; then
    echo "No project ${PROJECT_NAME} in ${WORKSPACE_ROOT}/${doc_name}." ;
    return 1 ;
  fi
  if ! leantime_is_project "${project_path}" ; then
    echo "${doc_name}/${PROJECT_NAME} is not a Leantime site of this plugin." ;
    return 1 ;
  fi
  leantime_refresh_files "${project_path}" || return 1 ;
  cd "${project_path}" || return 1 ;
}

# The site's copy of the plugin's scripts (leantime/), brought up to the installed plugin's, so a plugin updated with
# --install reaches the sites built before it. The site's own values (leantime/env) are left as they are.
function leantime_refresh_files() {
  local project_path="$1" from="${WORKSPACE_SCRIPTS}/plugins/leantime" f ;
  [ -d "${project_path}/${LEANTIME_FILES}" ] || return 0 ;
  for f in leantime-site.php ; do
    if [ -f "${from}/${f}" ] && ! cmp -s "${from}/${f}" "${project_path}/${LEANTIME_FILES}/${f}" ; then
      cp "${from}/${f}" "${project_path}/${LEANTIME_FILES}/${f}" || return 1 ;
    fi
  done
}

# A value of the site's own values (leantime/env), never printed by the tools: LEANTIME_RELEASE.
function leantime_setting() {
  sed -n "s/^$1=\\(.*\\)\$/\\1/p" "${2:-.}/${LEANTIME_FILES}/env" 2>/dev/null | head -n 1 ;
}

# A value made for this site only: letters and digits.
function leantime_secret() {
  head -c 200 /dev/urandom | base64 -w0 | tr -dc 'A-Za-z0-9' | head -c "${1:-64}" ;
}

# The free memory of this machine, in MB (what the kernel says is available).
function leantime_free_memory() {
  awk '/^MemAvailable:/ { print int($2 / 1024) }' /proc/meminfo 2>/dev/null ;
}

# Write the project's files: Leantime's service (.ddev/docker-compose.leantime.yaml), its image in .ddev/.env, the
# claim (.ddev/config.leantime.yaml) and the plugin's scripts.
function leantime_write_config() {
  local project_path="$1" release="$2" ;
  local from="${WORKSPACE_SCRIPTS}/plugins/leantime" f ;
  for f in docker-compose.leantime.yaml leantime-site.php ; do
    if [ ! -f "${from}/${f}" ] ; then
      echo "${f} is not in ${from}: install the plugin (plugins.sh --install leantime)." ;
      return 1 ;
    fi
  done
  mkdir -p "${project_path}/${LEANTIME_FILES}" || return 1 ;
  cp "${from}/leantime-site.php" "${project_path}/${LEANTIME_FILES}/" || return 1 ;
  cp "${from}/docker-compose.leantime.yaml" "${project_path}/.ddev/docker-compose.leantime.yaml" || return 1 ;
  printf 'LEANTIME_IMAGE=%s\n' "docker.io/leantime/leantime:${release}" > "${project_path}/.ddev/.env" || return 1 ;
  cat > "${project_path}/.ddev/config.leantime.yaml" <<YAMLEOF
# Leantime in this project: its service (docker-compose.leantime.yaml), its image in .env, the site's own values in
# ../leantime/env. Written by the Leantime builder of the workspace; build again rather than editing.
web_environment:
  - LEANTIME_RELEASE=${release}
YAMLEOF
}

# The site's own values (leantime/env, which only you can read): the address, the project's database, the mail
# catcher, and its session key, of this site only.
function leantime_write_env() {
  local project_path="$1" release="$2" base_url="$3" ;
  local secure='false' ;
  [[ "${base_url}" == https://* ]] && secure='true' ;
  ( umask 077 && cat > "${project_path}/${LEANTIME_FILES}/env" <<ENVEOF
# The values of this Leantime site, made by the Leantime builder of the workspace: its session key is of this site
# only. Read by Leantime's container; never printed.
LEANTIME_RELEASE=${release}
LEAN_APP_URL=${base_url}
LEAN_DB_HOST=db
LEAN_DB_USER=db
LEAN_DB_PASSWORD=db
LEAN_DB_DATABASE=db
LEAN_DB_PORT=3306
LEAN_SESSION_PASSWORD=$(leantime_secret 64)
LEAN_SESSION_SECURE=${secure}
LEAN_SITENAME=Leantime
LEAN_LANGUAGE=en-US
LEAN_DEFAULT_TIMEZONE=UTC
LEAN_ALLOW_TELEMETRY=false
LEAN_EMAIL_RETURN=leantime@example.com
LEAN_EMAIL_USE_SMTP=true
LEAN_EMAIL_SMTP_HOSTS=web
LEAN_EMAIL_SMTP_PORT=1025
LEAN_EMAIL_SMTP_AUTH=false
LEAN_EMAIL_SMTP_AUTO_TLS=false
ENVEOF
  ) ;
}

# Run a command line in Leantime's container, in its folder (/var/www/html), as its own user; what is piped in
# reaches it.
function leantime_exec() {
  ddev exec -s leantime "sh -c $(printf '%q' "cd /var/www/html && ${1}")" ;
}

# The folder the plugin's scripts are read from in Leantime's container.
function leantime_scripts_dir() {
  echo '/opt/webship' ;
}

# The answer of Leantime's login page, asked inside the project's network from the web container: 200 once Leantime
# is installed and reaches its database, a redirect (to its installer) before.
function leantime_probe() {
  ddev exec "curl -s -o /dev/null -m 10 -w '%{http_code}' http://leantime:8080/auth/login" < /dev/null 2>/dev/null | tr -d '\r' | tail -1 ;
}

# Wait until the site answers, in the project's folder: up to five minutes.
function leantime_wait() {
  local attempt code="" ;
  for attempt in $(seq 1 100) ; do
    code="$(leantime_probe)" ;
    case "${code}" in 200|302|303) return 0 ;; esac
    sleep 3 ;
  done
  echo "Leantime did not answer (its login page: ${code:-none}); the end of its log:" ;
  ddev logs -s leantime --tail 40 < /dev/null 2>/dev/null ;
  return 1 ;
}

# Run verbs of leantime-site.php (version, install, defaults, accounts, content, tidy, list, token, counts) with
# Leantime's own code in its container. A payload (an account, passwords, a login) travels on the input, never on a
# command line.
function leantime_site() {
  leantime_exec "php $(leantime_scripts_dir)/leantime-site.php $*" ;
}

# The release the site runs, as Leantime says it.
function leantime_version() {
  ( cd "${WORKSPACE_ROOT}/${doc_name}/${PROJECT_NAME}" 2>/dev/null && leantime_site version < /dev/null 2>/dev/null ) | tr -d '\r' | sed -n 's/^VERSION //p' | tail -n 1 ;
}

# Rows of accounts for leantime-site.php, as the base64 of its JSON list: "login|mail|password|first|last|role|member|
# action" lines in LEANTIME_ROWS, which travel to Python in the environment, never on a command line.
function leantime_accounts_payload() {
  LEANTIME_ROWS="$1" python3 -c '
import base64, json, os
rows = []
for line in os.environ["LEANTIME_ROWS"].split("\x1e"):
    if not line:
        continue
    login, mail, password, first, last, role, member, action = line.split("\x1f")
    rows.append({"login": login, "mail": mail, "password": password, "first": first, "last": last, "role": role,
                 "member": member == "yes", "action": action})
print(base64.b64encode(json.dumps(rows).encode()).decode())' ;
}

# The workspace account for leantime-site.php's installer, as the base64 of its JSON: its address, password and name.
function leantime_install_payload() {
  LEANTIME_MAIL="$1" LEANTIME_PASSWORD="$2" LEANTIME_FIRST="$3" python3 -c '
import base64, json, os
print(base64.b64encode(json.dumps({"mail": os.environ["LEANTIME_MAIL"], "password": os.environ["LEANTIME_PASSWORD"],
      "first": os.environ["LEANTIME_FIRST"], "last": "Workspace", "company": "Webship"}).encode()).decode())' ;
}

# Build a Leantime site from nothing: the project and Leantime; with --install Leantime's own installer, the
# workspace account the site's owner; with --add-users the default accounts in their roles of the sample project; with
# --sample-content its tasks, its sprint, comments and logged time.
function leantime_build() {
  trim_project_name ;
  local release="${LEANTIME_VERSION:-${site_leantime_release:-${LEANTIME_DEFAULT_RELEASE}}}" ;
  release="${release#v}" ;
  local project_path="${WORKSPACE_ROOT}/${doc_name}/${PROJECT_NAME}" ;
  local runtime ; runtime="$(cd "${WORKSPACE_ROOT}/${doc_name}" && leantime_runtime)" ;

  if [ "${runtime}" != 'ddev' ] ; then
    echo "Leantime builds on DDEV for now (--runtime ddev), not on ${runtime}: that runtime is not proven for it yet. Nothing was changed." ;
    exit 1 ;
  fi
  if ! [[ "${release}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] ; then
    echo "--release takes a release of Leantime (3.17.0), not ${release}. Nothing was changed." ;
    exit 1 ;
  fi
  if [ "${ADD_USERS}" == 'yes' ] && [ "${INSTALL}" != 'yes' ] ; then
    echo "--add-users needs --install: the default accounts go into the site --install sets up." ;
    exit 1 ;
  fi
  if [ "${SAMPLE_CONTENT}" == 'yes' ] && [ "${ADD_USERS}" != 'yes' ] ; then
    echo "--sample-content needs --add-users: the sample project's members are the default accounts." ;
    exit 1 ;
  fi
  if [ ${#PROJECT_NAME} -gt 40 ] || ! [[ "${PROJECT_NAME}" =~ ^[a-z0-9][a-z0-9-]*$ ]] ; then
    echo "The project name ${PROJECT_NAME} must be small letters, digits and dashes (its address and its containers take it). Nothing was changed." ;
    exit 1 ;
  fi
  if [ "${INSTALL}" == 'yes' ] && [ ${#account_pass} -lt 8 ] ; then
    echo "The workspace account's password (core/config/settings.yml) has fewer than eight characters, which Leantime asks of a password: --install makes it the site's owner. Nothing was changed." ;
    exit 1 ;
  fi
  local free ; free="$(leantime_free_memory)" ;
  if [ -n "${free}" ] && [ "${free}" -lt "${LEANTIME_MEMORY_MB}" ] ; then
    echo "Leantime needs about ${LEANTIME_MEMORY_MB} MB of free memory (its web server and PHP, and MySQL); this machine has ${free} MB available now. Stop a site you do not need, then build again. Nothing was changed." ;
    exit 1 ;
  fi

  cd ${WORKSPACE_ROOT}/${doc_name} || exit 1 ;

  # A project of the same name goes first, with its containers and its volumes (Leantime's database and files).
  drop_database ;
  rm -rf "${PROJECT_NAME:?}" ;
  mkdir -p "${PROJECT_NAME}" ;
  cd "${project_path}" || exit 1 ;

  # A generic project on MySQL 8.4, the release Leantime's own compose file runs.
  ddev config --project-type=generic --project-name=${PROJECT_NAME} --database=mysql:8.4 \
    --nodejs-version=$(ddev_nodejs_version) < /dev/null || exit 1 ;
  leantime_write_config "${project_path}" "${release}" || exit 1 ;
  local base_url ; base_url="$(leantime_url)" ;
  leantime_write_env "${project_path}" "${release}" "${base_url}" || exit 1 ;

  echo "Starting the project and Leantime ${release}: its image is about 320 MB the first time." ;
  ddev_up start -y < /dev/null || exit 1 ;
  leantime_wait || exit 1 ;

  if [ "${INSTALL}" == 'yes' ] ; then
    echo "Installing Leantime with its own installer: the workspace account is the site's owner." ;
    leantime_install_payload "${account_mail:-${account_name}@example.com}" "${account_pass}" "${account_name^}" \
      | leantime_site install defaults || { echo "Leantime could not be installed." ; exit 1 ; } ;
    if [ "$(leantime_probe)" != '200' ] ; then
      echo "Leantime answers $(leantime_probe) on its login page after its installer: a visitor would not get the login form." ;
      exit 1 ;
    fi
    if [ "${ADD_USERS}" == 'yes' ] ; then
      set_leantime_users ;
      add_leantime_users || exit 1 ;
      if [ "${SAMPLE_CONTENT}" == 'yes' ] ; then
        echo "Adding the sample content: the tasks of ${LEANTIME_PROJECT_NAME}, its sprint, comments and logged time." ;
        ( cd "${project_path}" && leantime_site content < /dev/null ) || exit 1 ;
      fi
      users=() ;
    fi
    echo "${doc_name} ${PROJECT_NAME} has been installed: Leantime $(leantime_version).";
    echo "The site: ${base_url}" ;
    echo "The workspace account logs in as ${account_mail:-${account_name}@example.com}, the site's owner." ;
  else
    echo "${doc_name} ${PROJECT_NAME} is ready at ${base_url}: Leantime's installer asks for the first account.";
    echo "Build it again with --install (and --add-users) for the workspace account and the default accounts.";
  fi

  if [ "${LAUNCH}" == 'yes' ] ; then
    ddev launch ;
  fi

  cd ${WORKSPACE_ROOT}/${doc_name};
}

# Make the default accounts, or give them back their names, passwords and roles: each a member of the sample project
# in its role, the stranger of none. The list is loaded by the caller (set_leantime_users): the core's add_users, the
# builder, the tool.
function add_leantime_users() {
  leantime_enter_project || return 1 ;
  local user user_name user_mail user_password user_first user_last user_role user_member rows="" ;
  for user in "${users[@]}" ; do
    user_name="user_${user}_name"; user_mail="user_${user}_mail"; user_password="user_${user}_password";
    user_first="user_${user}_first"; user_last="user_${user}_last"; user_role="user_${user}_role"; user_member="user_${user}_member";

    echo " ---------------------------------------------------------------- ";
    echo "      User name: ${!user_name}";
    echo "      User mail: ${!user_mail}";
    echo "  User password: ${!user_password}";
    echo "      User role: ${!user_role}$([ -n "${!user_member}" ] && echo " of ${LEANTIME_PROJECT_NAME}" || echo ", no membership")";
    echo " ================================================================= ";
    rows="${rows}${!user_name}"$'\x1f'"${!user_mail}"$'\x1f'"${!user_password}"$'\x1f'"${!user_first}"$'\x1f'"${!user_last}"$'\x1f'"${!user_role}"$'\x1f'"${!user_member}"$'\x1f'$'\x1e' ;
  done
  leantime_accounts_payload "${rows}" | leantime_site accounts ;
  local status=$? ;
  cd ${WORKSPACE_ROOT}/${doc_name};
  return ${status} ;
}

# Keep the default accounts from logging in (their work stays), never the workspace account.
function cancel_leantime_users() {
  leantime_enter_project || return 1 ;
  local user user_name user_mail rows="" ;
  for user in "${users[@]}" ; do
    user_name="user_${user}_name"; user_mail="user_${user}_mail";
    echo " ---------------------------------------------------------------- ";
    echo "      User name: ${!user_name}";
    echo "      User mail: ${!user_mail}";
    echo " ================================================================= ";
    rows="${rows}${!user_name}"$'\x1f'"${!user_mail}"$'\x1f'$'\x1f'$'\x1f'$'\x1f'$'\x1f'$'\x1f''lock'$'\x1e' ;
  done
  leantime_accounts_payload "${rows}" | leantime_site accounts ;
  local status=$? ;
  cd ${WORKSPACE_ROOT}/${doc_name};
  return ${status} ;
}

# Point the dashboard's Leantime (core/config/plugin.leantime.settings.yml) at this site, as an account of it: a new
# bearer token of that account (made by Leantime's own console in its container; the account's earlier one is
# revoked) goes into the settings file, which only you can read, never on a screen or in a log; with it the site's
# address, and the sample project as the default one when none was set.
function leantime_connect() {
  local login="$1" settings="${WORKSPACE_CONFIG}/plugin.leantime.settings.yml" out token url ;
  if ! [[ "${login}" =~ ^[A-Za-z0-9._@-]+$ ]] ; then echo "--connect takes the login or e-mail address of an account of the site." ; return 1 ; fi
  if [ ! -f "${settings}" ] ; then echo "No ${settings}: install the plugin first (plugins.sh --install leantime)." ; return 1 ; fi
  out="$(LEANTIME_LOGIN="${login}" python3 -c 'import base64, json, os; print(base64.b64encode(json.dumps({"login": os.environ["LEANTIME_LOGIN"]}).encode()).decode())' | leantime_site token 2>/dev/null)" ;
  token="$(printf '%s\n' "${out}" | tr -d '\r' | sed -n 's/^TOKEN //p' | tail -n 1)" ;
  out='' ;
  if ! [[ "${token}" =~ ^[A-Za-z0-9|]{20,}$ ]] ; then echo "No token could be made for ${login} (is it an active account of the site?)." ; return 1 ; fi
  url="$(leantime_url)" ;
  LEANTIME_NEW_TOKEN="${token}" python3 - "${settings}" "${url}" "${LEANTIME_PROJECT_NAME}" <<'PYEOF' || return 1
import os, re, sys
path, url, scope = sys.argv[1:4]
token = os.environ['LEANTIME_NEW_TOKEN']
text = open(path).read()
def put(text, key, value):
    line = '%s: %s' % (key, value)
    if re.search(r'^%s:.*$' % key, text, re.M):
        return re.sub(r'^%s:.*$' % key, lambda m: line, text, count=1, flags=re.M)
    return text.rstrip('\n') + '\n' + line + '\n'
text = put(text, 'url', url)
text = put(text, 'token', token)
if not re.search(r'^default_scope:[ \t]*[^ \t\n"]', text, re.M) and not re.search(r'^default_scope:[ \t]*"[^"]', text, re.M):
    text = put(text, 'default_scope', '"%s"' % scope)
fd = os.open(path + '.new', os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w') as f:
    f.write(text)
os.replace(path + '.new', path)
PYEOF
  token='' ;
  echo "The dashboard reads the tasks of ${url} as ${login} now: a new bearer token of that account is in ${settings} (not shown here, its earlier one revoked), and ${LEANTIME_PROJECT_NAME} is the default project when none was set." ;
}

# What cmd-tools-leantime-cli.sh does: the first of --run, --add-users, --cancel-users, --sample-content, --tidy,
# --connect that was asked for; with none of them, what the site is and its accounts.
function leantime_cli_tool() {
  trim_project_name ;
  leantime_enter_project || exit 1 ;

  ddev describe -j 2>/dev/null | grep -q '"status":"running"' || ddev start -y < /dev/null || exit 1 ;
  leantime_wait > /dev/null || { echo "Leantime of ${PROJECT_NAME} does not answer; start it again (ddev restart in ${doc_name}/${PROJECT_NAME})." ; exit 1 ; } ;

  if [ ! "${RUN}" == '_none_' ] ; then
    # Leantime's own console (php bin/leantime <command>), in its container.
    leantime_exec "php bin/leantime ${RUN}" < /dev/null ;
    exit $? ;
  fi

  set_leantime_users ;
  if [ "${ADD_USERS}" == 'yes' ] ; then
    add_leantime_users ;
  elif [ "${CANCEL_USERS}" == 'yes' ] ; then
    cancel_leantime_users ;
  elif [ "${SAMPLE_CONTENT}" == 'yes' ] ; then
    leantime_site content list < /dev/null ;
  elif [ "${TIDY}" == 'yes' ] ; then
    # What a test run that was stopped half way left: its tasks ("Webship test …"), with their comments.
    leantime_site tidy list < /dev/null ;
  elif [ "${CONNECT}" != '_none_' ] ; then
    leantime_connect "${CONNECT}" ;
  else
    echo "${doc_name}/${PROJECT_NAME}: Leantime $(leantime_version)" ;
    echo "  the site:  $(leantime_url)" ;
    echo "" ;
    leantime_site list < /dev/null ;
  fi
  cd ${WORKSPACE_ROOT}/${doc_name};
}
