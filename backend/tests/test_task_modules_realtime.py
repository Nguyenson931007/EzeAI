import unittest
from unittest.mock import patch

from starlette.responses import Response

from api.jobs import get_job_task_modules


class _Cursor:
    def __init__(self, hw_row, step_rows):
        self.hw_row = hw_row
        self.step_rows = step_rows
        self.query_index = 0

    def execute(self, *_args, **_kwargs):
        self.query_index += 1

    def fetchone(self):
        return self.hw_row

    def fetchall(self):
        return self.step_rows


class _Connection:
    def __init__(self, hw_row, step_rows):
        self.cursor_instance = _Cursor(hw_row, step_rows)
        self.closed = False

    def cursor(self, **_kwargs):
        return self.cursor_instance

    def close(self):
        self.closed = True


class TaskModulesRealtimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_returns_visible_modules_and_no_store_header(self):
        connection = _Connection(
            {"hw_id": "hw-newest"},
            [
                {"step_number": 1, "is_visible": 1},
                {"step_number": 2, "is_visible": 0},
                {"step_number": 7, "is_visible": True},
                {"step_number": 13, "is_visible": 0},
            ],
        )
        response = Response()

        with patch("app.mssql_db.get_mssql_connection", return_value=connection):
            result = await get_job_task_modules("ems-1", response, "session")

        self.assertEqual(result["data"]["hw_id"], "hw-newest")
        self.assertEqual(result["data"]["task_modules"], ["cladding", "fixout"])
        self.assertTrue(result["data"]["task_modules_configured"])
        self.assertIn("no-store", response.headers["cache-control"])
        self.assertTrue(connection.closed)

    async def test_unconfigured_job_does_not_clear_frontend_modules(self):
        connection = _Connection(None, [])
        response = Response()

        with patch("app.mssql_db.get_mssql_connection", return_value=connection):
            result = await get_job_task_modules("ems-without-hw", response, "session")

        self.assertEqual(result["data"]["task_modules"], [])
        self.assertFalse(result["data"]["task_modules_configured"])
        self.assertTrue(connection.closed)


if __name__ == "__main__":
    unittest.main()
