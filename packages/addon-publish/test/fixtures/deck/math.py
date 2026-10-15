# region add
def add(a, b):
    # region check
    assert isinstance(a, int) and isinstance(b, int)
    # endregion check
    # region sum
    return a + b
    # endregion sum
# endregion add
