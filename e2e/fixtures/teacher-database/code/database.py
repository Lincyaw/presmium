"""A tiny database, kept short enough to build and explain during a class."""

# #region memory
# #region state
rows = {}
# #endregion state

# #region write
def put(key, value):
    rows[key] = value
# #endregion write

# #region read
def get(key):
    return rows.get(key)
# #endregion read

put("Ada", 10)
print("memory:", get("Ada"))
# #endregion memory

# #region append-only
# #region log-state
log = []
# #endregion log-state

# #region append
def put(key, value):
    log.append((key, value))
# #endregion append

# #region lookup
def get(key):
    for stored_key, value in reversed(log):
        if stored_key == key:
            return value
    return None
# #endregion lookup

put("Ada", 10)
print("log:", log)
# #endregion append-only

# #region remove
def delete(key):
    put(key, None)
# #endregion remove
