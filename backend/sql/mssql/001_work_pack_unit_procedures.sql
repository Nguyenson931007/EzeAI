/*
  EzeFloor Work-Pack Unit stored procedures
  -----------------------------------------
  Run this script once in the ProcurementApp database during deployment.
  Application code then calls these procedures; changes to SQL conditions can
  be deployed here without changing/rebuilding EzeFloor.
*/
USE [ProcurementApp];
GO

CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_WorkPackUnit_EnsureSchema
AS
BEGIN
    SET NOCOUNT ON;
    IF OBJECT_ID(N'dbo.WorkPackInput', N'U') IS NULL
    BEGIN
        CREATE TABLE dbo.WorkPackInput (
            id BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_WorkPackInput PRIMARY KEY,
            customer_id NVARCHAR(100) NOT NULL,
            job_id NVARCHAR(100) NOT NULL,
            sheet_id NVARCHAR(150) NOT NULL,
            unit NVARCHAR(100) NULL,
            fields_data VARBINARY(MAX) NOT NULL,
            is_old_data BIT NOT NULL CONSTRAINT DF_WorkPackInput_is_old_data DEFAULT (0),
            user_update NVARCHAR(100) NULL,
            datetime_update DATETIME2 NOT NULL CONSTRAINT DF_WorkPackInput_datetime_update DEFAULT (SYSDATETIME())
        );
        CREATE INDEX IX_WorkPackInput_job
            ON dbo.WorkPackInput (customer_id, job_id, sheet_id, is_old_data)
            INCLUDE (datetime_update);
    END;

    IF COL_LENGTH(N'dbo.WorkPackInput', N'unit') IS NULL
        ALTER TABLE dbo.WorkPackInput ADD unit NVARCHAR(100) NULL;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_WorkPackUnit_ResolveJob
    @job_id NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP 1
        CAST(IDJob AS NVARCHAR(100)) AS id_job,
        LTRIM(RTRIM(ISNULL(CAST(JobNumber AS NVARCHAR(100)), ''))) AS job_number,
        LTRIM(RTRIM(ISNULL(CAST(ClientJobNumber AS NVARCHAR(100)), ''))) AS client_job_number
    FROM [Ezequotepersonalmanagement].[dbo].[ListJobs]
    WHERE CAST(IDJob AS NVARCHAR(100)) = @job_id
       OR UPPER(LTRIM(RTRIM(ISNULL(CAST(JobNumber AS NVARCHAR(100)), '')))) = UPPER(@job_id)
       OR UPPER(LTRIM(RTRIM(ISNULL(CAST(ClientJobNumber AS NVARCHAR(100)), '')))) = UPPER(@job_id);
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_WorkPackUnit_List
    @customer_id NVARCHAR(100),
    @job_aliases_csv NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    IF OBJECT_ID(N'dbo.WorkPackInput', N'U') IS NULL
    BEGIN
        SELECT CAST(NULL AS NVARCHAR(100)) AS unit WHERE 1 = 0;
        RETURN;
    END;

    ;WITH aliases AS (
        SELECT UPPER(LTRIM(RTRIM(value))) AS job_id
        FROM STRING_SPLIT(@job_aliases_csv, ',')
        WHERE LTRIM(RTRIM(value)) <> ''
    )
    SELECT ISNULL(w.unit, N'Unit 1') AS unit
    FROM dbo.WorkPackInput AS w
    WHERE w.customer_id = @customer_id
      AND UPPER(LTRIM(RTRIM(w.job_id))) IN (SELECT job_id FROM aliases)
      AND ISNULL(w.is_old_data, 0) = 0
    GROUP BY ISNULL(w.unit, N'Unit 1');
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_WorkPackUnit_Add
    @customer_id NVARCHAR(100),
    @job_id NVARCHAR(100),
    @sheet_id NVARCHAR(150),
    @unit NVARCHAR(100),
    @user_update NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.WorkPackInput
        (customer_id, job_id, sheet_id, unit, fields_data, is_old_data, user_update, datetime_update)
    VALUES
        (@customer_id, @job_id, @sheet_id, @unit, COMPRESS(CAST(N'{}' AS NVARCHAR(MAX))), 0, @user_update, SYSDATETIME());
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_WorkPackUnit_Rename
    @customer_id NVARCHAR(100),
    @job_aliases_csv NVARCHAR(MAX),
    @current_unit NVARCHAR(100),
    @new_unit NVARCHAR(100),
    @user_update NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    ;WITH aliases AS (
        SELECT UPPER(LTRIM(RTRIM(value))) AS job_id
        FROM STRING_SPLIT(@job_aliases_csv, ',')
        WHERE LTRIM(RTRIM(value)) <> ''
    )
    UPDATE w
       SET unit = @new_unit,
           user_update = @user_update,
           datetime_update = SYSDATETIME()
    FROM dbo.WorkPackInput AS w
    WHERE w.customer_id = @customer_id
      AND UPPER(LTRIM(RTRIM(w.job_id))) IN (SELECT job_id FROM aliases)
      AND ISNULL(w.unit, N'Unit 1') = @current_unit;

    SELECT @@ROWCOUNT AS affected_rows;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_WorkPackUnit_Delete
    @customer_id NVARCHAR(100),
    @job_aliases_csv NVARCHAR(MAX),
    @unit NVARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;
    ;WITH aliases AS (
        SELECT UPPER(LTRIM(RTRIM(value))) AS job_id
        FROM STRING_SPLIT(@job_aliases_csv, ',')
        WHERE LTRIM(RTRIM(value)) <> ''
    )
    DELETE w
    FROM dbo.WorkPackInput AS w
    WHERE w.customer_id = @customer_id
      AND UPPER(LTRIM(RTRIM(w.job_id))) IN (SELECT job_id FROM aliases)
      AND ISNULL(w.unit, N'Unit 1') = @unit;

    SELECT @@ROWCOUNT AS affected_rows;
END;
GO
