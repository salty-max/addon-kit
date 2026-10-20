"""The family folder (~/code/wow-addons, the one holding addon-kit/ and
wow-data/), found from anywhere: root.ts's twin, the same order and answers.

  1. WOW_ADDONS_ROOT, when set (an error if it isn't a family folder);
  2. up from the working directory;
  3. up from the repository's main checkout (git's common dir: a worktree
     anywhere on the disk still belongs to ~/code/wow-addons/<repo>/.git);
  4. up from this file.

  python3 addon-kit/root.py            the family folder
  python3 addon-kit/root.py wow-data   a folder in it

  from root import family_path   (an addon's scripts/root.py, the kit's copy: kit:sync)
  sys.path.insert(0, family_path("wow-data", "py"))
"""
import os
import subprocess
import sys


def is_family(path):
    return os.path.isdir(os.path.join(path, "addon-kit")) and os.path.isdir(os.path.join(path, "wow-data"))


def find_up(start):
    path = os.path.abspath(start)
    while True:
        if is_family(path):
            return path
        up = os.path.dirname(path)
        if up == path:
            return None
        path = up


def _common_dir(start):
    if not os.path.isdir(start):
        return None
    p = subprocess.run(
        ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
        cwd=start, capture_output=True, text=True,
    )
    return p.stdout.strip() if p.returncode == 0 else None


def family_root(start=None):
    env = os.environ.get("WOW_ADDONS_ROOT")
    if env:
        if is_family(env):
            return os.path.abspath(env)
        raise RuntimeError(f"WOW_ADDONS_ROOT={env} holds no addon-kit/ and wow-data/")
    start = start or os.getcwd()
    common = _common_dir(start)
    found = (
        find_up(start)
        or (common and find_up(os.path.dirname(common)))
        or find_up(os.path.dirname(os.path.abspath(__file__)))
    )
    if found:
        return found
    raise RuntimeError(f"no family folder (addon-kit/ and wow-data/ side by side) above {start}: set WOW_ADDONS_ROOT")


def family_path(*parts):
    return os.path.join(family_root(), *parts)


if __name__ == "__main__":
    try:
        print(family_path(*sys.argv[1:]))
    except RuntimeError as e:
        print(e, file=sys.stderr)
        sys.exit(1)
