import asyncio
import unittest
from unittest.mock import patch

from pydantic import ValidationError

from api import framework_routes


class _FakeCursor:
    def __init__(self):
        self.calls = []
        self._fetchone = None

    def execute(self, sql, params=None):
        self.calls.append((sql, params))
        if "SELECT id FROM [emsflow].[dbo].[task_group_hw]" in sql:
            self._fetchone = ("hw-1",)
        else:
            self._fetchone = None

    def fetchone(self):
        return self._fetchone


class _FakeConnection:
    def __init__(self):
        self.cursor_instance = _FakeCursor()
        self.committed = False
        self.closed = False

    def autocommit(self, _enabled):
        return None

    def cursor(self):
        return self.cursor_instance

    def commit(self):
        self.committed = True

    def rollback(self):
        return None

    def close(self):
        self.closed = True


class FrameworkRoutesTests(unittest.TestCase):
    def test_upper_floors_cannot_be_negative(self):
        with self.assertRaises(ValidationError):
            framework_routes.JobSaveSchema(id_job_hw="hw-1", upper_floors=-1, walls=[])

    def test_bun_vic_save_adds_non_wall_upper_floor_metadata(self):
        connection = _FakeConnection()
        payload = framework_routes.SaveJobsPayloadSchema(
            user_update="tester",
            jobs=[
                framework_routes.JobSaveSchema(
                    id_job_hw="hw-1",
                    upper_floors=2,
                    walls=[
                        framework_routes.WallItemSchema(
                            floor_type="Slab",
                            wall_height=2440,
                            wall_length=3453,
                            spacing=900,
                            rod_size="M12",
                            short_name="BUN-VIC",
                            floor_level="GF",
                        )
                    ],
                )
            ],
        )

        with patch.object(framework_routes, "get_mssql_connection", return_value=connection):
            response = asyncio.run(framework_routes.save_framework_jobs(payload))

        insert_calls = [
            params
            for sql, params in connection.cursor_instance.calls
            if "INSERT INTO [ProcurementApp].[dbo].[FrameWork]" in sql
        ]
        self.assertTrue(connection.committed)
        self.assertEqual(response["jobs_saved"], [
            {"id_job_hw": "hw-1", "walls_inserted": 1, "upper_floors_saved": True}
        ])
        self.assertEqual(len(insert_calls), 2)
        self.assertEqual(insert_calls[0][1:6], (2440.0, 3453.0, "Slab", 900.0, "M12"))
        self.assertEqual(insert_calls[1][1:8], (
            2.0,
            0,
            framework_routes._BUN_VIC_UPPER_FLOORS_MARKER,
            0,
            "N/A",
            "BUN-VIC",
            "META",
        ))


if __name__ == "__main__":
    unittest.main()
