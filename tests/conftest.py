import pytest
import sys


@pytest.fixture(autouse=True)
def clear_sdk_contract_registration():
    # The direct-mode loader reloads the file for each test. The SDK retains
    # its one-contract-per-module registration across those reloads.
    module = sys.modules.get("genlayer.gl.genvm_contracts")
    if module is not None:
        module.__known_contract__ = None
    yield
    module = sys.modules.get("genlayer.gl.genvm_contracts")
    if module is not None:
        module.__known_contract__ = None
