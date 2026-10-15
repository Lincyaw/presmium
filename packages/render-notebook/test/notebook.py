"""Checks a notebook with the local Jupyter stack (nbformat, nbclient, ipykernel).

  python3 notebook.py validate <file>   validates it against the nbformat schema; exits 1 when invalid
  python3 notebook.py run <file>        runs its code cells in order on its kernel, prints their outputs as JSON
  python3 notebook.py run-all <file>    the same, but an error does not stop the run; prints each code cell's
                                        metadata and outputs as JSON. Cells tagged skip-execution are skipped.
"""
import json
import sys
import warnings

import nbformat
from nbclient import NotebookClient

command, path = sys.argv[1:3]

if command == "validate":
    # The file as written, before nbformat.read could normalize it.
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    # Strict: what nbformat only warns about (a missing or duplicate cell id) is an error too.
    warnings.simplefilter("error")
    try:
        nbformat.validate(raw)
    except (nbformat.ValidationError, Warning) as error:
        sys.exit(f"invalid notebook: {error}")
elif command == "run":
    nb = nbformat.read(path, as_version=4)
    NotebookClient(nb, timeout=60, kernel_name=nb.metadata.kernelspec.name).execute()
    print(json.dumps([cell.outputs for cell in nb.cells if cell.cell_type == "code"]))
elif command == "run-all":
    nb = nbformat.read(path, as_version=4)
    NotebookClient(nb, timeout=20, kernel_name=nb.metadata.kernelspec.name, allow_errors=True).execute()
    print(json.dumps([{"metadata": cell.metadata, "outputs": cell.outputs} for cell in nb.cells if cell.cell_type == "code"]))
else:
    sys.exit(f"unknown command {command}")
