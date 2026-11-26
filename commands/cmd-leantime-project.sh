#!/usr/bin/env bash

# workspace-name: Leantime (project management)

# Installed by the Leantime plugin (plugins.sh --install leantime); __WORKSPACE__ is the workspace it was installed into.
#
# Build a Leantime site in containers from Leantime's own image, on the project's own MariaDB: on DDEV at
# https://<name>.ddev.site. With --install Leantime's own installer makes the workspace account the site's owner; with
# --add-users the default accounts are in their roles of the project Webship site; with --sample-content its tasks,
# its sprint Sprint 1, comments and logged time.

# Bootstrap.
# Find the workspace tooling from this script, so a fresh clone needs no setup.
WORKSPACE_SCRIPTS="${WORKSPACE_SCRIPTS:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../core/scripts" && pwd)}";
source ${WORKSPACE_SCRIPTS}/bootstrap.sh || exit 1 ;

# Load workspace settings.
eval $(parse_yaml ${WORKSPACE_CONFIG}/workspace.__WORKSPACE__.settings.yml);

# Distribution.
distribution_name="leantime";
distribution_title="Leantime";

ARGPARSE_DESCRIPTION="Build a ${distribution_title} site in __WORKSPACE__"
# The args file comes with the plugin: core/scripts/plugins/leantime/ is where plugins.sh --install puts it.
source ${WORKSPACE_SCRIPTS}/plugins/leantime/args/arg-leantime.sh || exit 1 ;

shift $#;

leantime_build ;
