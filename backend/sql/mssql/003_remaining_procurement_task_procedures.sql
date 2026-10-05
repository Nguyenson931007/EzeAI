USE [ProcurementApp];
GO

/* Remaining EzeFloor Procurement task procedures.
   All business SQL/filters/versioning live in SQL Server so route code only
   passes parameters and formats the returned rows. */

CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_Eaves_ResolveJob
    @InputValue NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @v NVARCHAR(200)=LTRIM(RTRIM(ISNULL(@InputValue,N'')));
    SELECT TOP (2)
        CONVERT(NVARCHAR(100),tghw.id) AS id,
        UPPER(LTRIM(RTRIM(COALESCE(NULLIF(lc.ShortName,N''),lj.Client)))) AS short_name
    FROM [emsflow].[dbo].[task_group_hw] tghw
    INNER JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj
      ON tghw.id_job_ems=lj.IDJob AND ISNULL(lj.IsDelete,0)=0
    LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListClient] lc
      ON lc.ClientName=lj.Client AND ISNULL(lc.IsDelete,0)=0
    WHERE ISNULL(tghw.is_delete,0)=0
      AND (CONVERT(NVARCHAR(200),tghw.id)=@v
        OR CONVERT(NVARCHAR(200),tghw.id_job_ems)=@v
        OR LOWER(LTRIM(RTRIM(ISNULL(lj.JobNumber,N''))))=LOWER(@v))
    ORDER BY CASE WHEN CONVERT(NVARCHAR(200),tghw.id)=@v THEN 0
                  WHEN CONVERT(NVARCHAR(200),tghw.id_job_ems)=@v THEN 1 ELSE 2 END,
             tghw.created_at DESC,tghw.id;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_Eaves_List
    @Unit NVARCHAR(50)=N'Unit 1', @Office NVARCHAR(50)=NULL
AS
BEGIN
 SET NOCOUNT ON;
 SELECT es.ID AS eaves_id,tghw.id AS IDJob_HW,tghw.id AS hw_id,tghw.id_job_ems,tghw.id_assign_ems,
        es.SheetBrand AS sheet_brand,es.SheetThickness AS sheet_thickness,es.SofitBatten AS sofit_batten,
        es.SofitBead AS sofit_bead,es.short_name,es.FloorLevel AS floor_level,es.UserUpdate AS user_update,
        es.DatetimeUpdate AS datetime_update,es.IsOldData AS is_old_data,es.InputDataJson AS input_data_json,
        lj.JobNumber AS job_number
 FROM [emsflow].[dbo].[task_group_hw] tghw
 LEFT JOIN dbo.EavesSoffit es ON tghw.id=es.IdJob_HW AND ISNULL(es.IsOldData,0)=0
   AND ISNULL(NULLIF(LTRIM(RTRIM(es.unit)),N''),N'Unit 1')=@Unit
 LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj ON tghw.id_job_ems=lj.IDJob AND ISNULL(lj.IsDelete,0)=0
 INNER JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj ON tghw.id_assign_ems=aj.ID AND ISNULL(aj.IsDelete,0)=0
 WHERE ISNULL(tghw.is_delete,0)=0 AND (@Office IS NULL OR UPPER(LTRIM(RTRIM(aj.MaNV)))=UPPER(@Office))
 ORDER BY tghw.id DESC;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_Eaves_Archive
 @JobHwId NVARCHAR(200),@Unit NVARCHAR(50),@ShortName NVARCHAR(100),@UserUpdate NVARCHAR(200)
AS
BEGIN
 SET NOCOUNT ON;
 DECLARE @lock_count INT;
 SELECT @lock_count=COUNT(*) FROM dbo.EavesSoffit WITH(UPDLOCK,HOLDLOCK)
 WHERE CONVERT(NVARCHAR(200),IdJob_HW)=@JobHwId
   AND ISNULL(NULLIF(LTRIM(RTRIM(unit)),N''),N'Unit 1')=@Unit
   AND UPPER(LTRIM(RTRIM(ISNULL(short_name,N''))))=UPPER(LTRIM(RTRIM(@ShortName)));
 UPDATE dbo.EavesSoffit SET IsOldData=1,UserUpdate=@UserUpdate,DatetimeUpdate=GETDATE()
 WHERE CONVERT(NVARCHAR(200),IdJob_HW)=@JobHwId
   AND ISNULL(NULLIF(LTRIM(RTRIM(unit)),N''),N'Unit 1')=@Unit
   AND UPPER(LTRIM(RTRIM(ISNULL(short_name,N''))))=UPPER(LTRIM(RTRIM(@ShortName)))
   AND ISNULL(IsOldData,0)=0;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_Eaves_Insert
 @JobHwId NVARCHAR(200),@Unit NVARCHAR(50),@SheetBrand NVARCHAR(200),@SheetThickness FLOAT,
 @SofitBatten NVARCHAR(300),@SofitBead NVARCHAR(300),@ShortName NVARCHAR(100),@UserUpdate NVARCHAR(200),
 @InputDataJson NVARCHAR(MAX),@FloorLevel NVARCHAR(20)
AS
BEGIN
 SET NOCOUNT ON;
 INSERT dbo.EavesSoffit(unit,ID,SheetBrand,SheetThickness,SofitBatten,SofitBead,short_name,IdJob_HW,UserUpdate,DatetimeUpdate,IsOldData,InputDataJson,FloorLevel)
 VALUES(@Unit,NEWID(),@SheetBrand,@SheetThickness,@SofitBatten,@SofitBead,@ShortName,@JobHwId,@UserUpdate,GETDATE(),0,@InputDataJson,@FloorLevel);
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_Eaves_CurrentCount
 @JobHwId NVARCHAR(200),@Unit NVARCHAR(50),@ShortName NVARCHAR(100)
AS
BEGIN
 SET NOCOUNT ON;
 SELECT COUNT(*) AS active_count FROM dbo.EavesSoffit
 WHERE CONVERT(NVARCHAR(200),IdJob_HW)=@JobHwId
   AND ISNULL(NULLIF(LTRIM(RTRIM(unit)),N''),N'Unit 1')=@Unit
   AND UPPER(LTRIM(RTRIM(ISNULL(short_name,N''))))=UPPER(LTRIM(RTRIM(@ShortName)))
   AND ISNULL(IsOldData,0)=0;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_FOWPlumbing_List
 @Unit NVARCHAR(50)=N'Unit 1',@JobHwId NVARCHAR(200)=NULL,@Office NVARCHAR(50)=NULL
AS
BEGIN SET NOCOUNT ON;
 SELECT fp.ID AS id,fp.IdJob_HW AS id_job_hw,fp.itemName AS item_name,fp.code,fp.description,fp.qty,fp.note,
        fp.FloorLevel AS floor_level,fp.UserUpdate AS user_update,fp.DatetimeUpdate AS datetime_update,fp.IsOldData AS is_old_data,
        tghw.id AS hw_id,tghw.id_job_ems,lj.JobNumber AS job_number
 FROM dbo.FOWPlumbing fp
 LEFT JOIN [emsflow].[dbo].[task_group_hw] tghw ON tghw.id=fp.IdJob_HW AND ISNULL(tghw.is_delete,0)=0
 LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj ON tghw.id_job_ems=lj.IDJob AND ISNULL(lj.IsDelete,0)=0
 LEFT JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj ON tghw.id_assign_ems=aj.ID AND ISNULL(aj.IsDelete,0)=0
 WHERE ISNULL(fp.IsOldData,0)=0 AND ISNULL(NULLIF(LTRIM(RTRIM(fp.unit)),N''),N'Unit 1')=@Unit
   AND (@JobHwId IS NULL OR CONVERT(NVARCHAR(200),fp.IdJob_HW)=@JobHwId OR CONVERT(NVARCHAR(200),tghw.id)=@JobHwId OR CONVERT(NVARCHAR(200),lj.JobNumber)=@JobHwId)
   AND (@Office IS NULL OR UPPER(LTRIM(RTRIM(aj.MaNV)))=UPPER(@Office) OR UPPER(LTRIM(RTRIM(fp.UserUpdate)))=UPPER(@Office))
 ORDER BY fp.DatetimeUpdate DESC,fp.ID; END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_FOWPlumbing_Archive @JobHwId NVARCHAR(200),@Unit NVARCHAR(50),@UserUpdate NVARCHAR(200) AS
BEGIN SET NOCOUNT ON; UPDATE dbo.FOWPlumbing SET IsOldData=1,UserUpdate=@UserUpdate,DatetimeUpdate=GETDATE()
 WHERE CONVERT(NVARCHAR(200),IdJob_HW)=@JobHwId AND ISNULL(NULLIF(LTRIM(RTRIM(unit)),N''),N'Unit 1')=@Unit AND ISNULL(IsOldData,0)=0; END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_FOWPlumbing_Insert
 @JobHwId NVARCHAR(200),@Unit NVARCHAR(50),@ItemName NVARCHAR(300),@Code NVARCHAR(200),@Description NVARCHAR(MAX),@Qty FLOAT,
 @Note NVARCHAR(MAX),@UserUpdate NVARCHAR(200),@FloorLevel NVARCHAR(20)
AS BEGIN SET NOCOUNT ON; INSERT dbo.FOWPlumbing(unit,IdJob_HW,itemName,code,description,qty,note,UserUpdate,DatetimeUpdate,IsOldData,FloorLevel)
 VALUES(@Unit,@JobHwId,@ItemName,@Code,@Description,@Qty,@Note,@UserUpdate,GETDATE(),0,@FloorLevel); END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_Shelving_List
 @Unit NVARCHAR(50)=N'Unit 1',@JobHwId NVARCHAR(200)=NULL,@Office NVARCHAR(50)=NULL
AS
BEGIN SET NOCOUNT ON;
 SELECT s.ID AS shelving_id,s.IdJob_HW,s.Type AS type,s.Size AS size,s.Qty AS qty,s.FloorLevel AS floor_level,
        s.UserUpdate AS user_update,s.DatetimeUpdate AS datetime_update,s.IsOldData AS is_old_data,
        tghw.id AS hw_id,tghw.id_job_ems,lj.JobNumber AS job_number
 FROM dbo.Shelving s
 LEFT JOIN [emsflow].[dbo].[task_group_hw] tghw ON tghw.id=s.IdJob_HW AND ISNULL(tghw.is_delete,0)=0
 LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj ON tghw.id_job_ems=lj.IDJob AND ISNULL(lj.IsDelete,0)=0
 LEFT JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj ON tghw.id_assign_ems=aj.ID AND ISNULL(aj.IsDelete,0)=0
 WHERE ISNULL(s.IsOldData,0)=0 AND ISNULL(NULLIF(LTRIM(RTRIM(s.unit)),N''),N'Unit 1')=@Unit
   AND (@JobHwId IS NULL OR CONVERT(NVARCHAR(200),s.IdJob_HW)=@JobHwId OR CONVERT(NVARCHAR(200),tghw.id)=@JobHwId OR CONVERT(NVARCHAR(200),lj.JobNumber)=@JobHwId)
   AND (@Office IS NULL OR UPPER(LTRIM(RTRIM(aj.MaNV)))=UPPER(@Office) OR UPPER(LTRIM(RTRIM(s.UserUpdate)))=UPPER(@Office))
 ORDER BY s.DatetimeUpdate DESC,s.ID; END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_Shelving_Archive @JobHwId NVARCHAR(200),@Unit NVARCHAR(50),@UserUpdate NVARCHAR(200) AS
BEGIN SET NOCOUNT ON; UPDATE dbo.Shelving SET IsOldData=1,UserUpdate=@UserUpdate,DatetimeUpdate=GETDATE()
 WHERE CONVERT(NVARCHAR(200),IdJob_HW)=@JobHwId AND ISNULL(NULLIF(LTRIM(RTRIM(unit)),N''),N'Unit 1')=@Unit AND ISNULL(IsOldData,0)=0; END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_Shelving_Insert @JobHwId NVARCHAR(200),@Unit NVARCHAR(50),@Type NVARCHAR(300),@Size NVARCHAR(300),@Qty FLOAT,@UserUpdate NVARCHAR(200),@FloorLevel NVARCHAR(20) AS
BEGIN SET NOCOUNT ON; INSERT dbo.Shelving(unit,ID,IdJob_HW,[Type],[Size],[Qty],UserUpdate,DatetimeUpdate,IsOldData,FloorLevel)
 VALUES(@Unit,NEWID(),@JobHwId,@Type,@Size,@Qty,@UserUpdate,GETDATE(),0,@FloorLevel); END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_TimberPosts_List @Unit NVARCHAR(50)=N'Unit 1',@Office NVARCHAR(50)=NULL AS
BEGIN SET NOCOUNT ON;
 SELECT tp.ID AS post_id,tghw.id AS IdJob_HW,tghw.id AS hw_id,tghw.id_job_ems,tghw.id_assign_ems,
        tp.PostType AS post_type,tp.PostHeight AS post_height,tp.PostSize AS post_size,tp.Post AS post,tp.Qty AS qty,
        tp.GalPostSupports AS gal_post_supports,tp.FloorLevel AS floor_level,tp.UserUpdate AS user_update,tp.DatetimeUpdate AS datetime_update,
        tp.IsOldData AS is_old_data,lj.JobNumber AS job_number
 FROM [emsflow].[dbo].[task_group_hw] tghw
 LEFT JOIN dbo.Beams tp ON tghw.id=tp.IdJob_HW AND ISNULL(tp.IsOldData,0)=0 AND ISNULL(NULLIF(LTRIM(RTRIM(tp.unit)),N''),N'Unit 1')=@Unit
 LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj ON tghw.id_job_ems=lj.IDJob AND ISNULL(lj.IsDelete,0)=0
 LEFT JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj ON tghw.id_assign_ems=aj.ID AND ISNULL(aj.IsDelete,0)=0
 WHERE ISNULL(tghw.is_delete,0)=0 AND (@Office IS NULL OR UPPER(LTRIM(RTRIM(aj.MaNV)))=UPPER(@Office))
 ORDER BY tghw.created_at DESC,tp.DatetimeUpdate DESC; END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_TimberPosts_Archive @JobHwId NVARCHAR(200),@Unit NVARCHAR(50),@UserUpdate NVARCHAR(200) AS
BEGIN SET NOCOUNT ON; UPDATE dbo.Beams SET IsOldData=1,UserUpdate=@UserUpdate,DatetimeUpdate=GETDATE()
 WHERE CONVERT(NVARCHAR(200),IdJob_HW)=@JobHwId AND ISNULL(NULLIF(LTRIM(RTRIM(unit)),N''),N'Unit 1')=@Unit AND ISNULL(IsOldData,0)=0; END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_TimberPosts_Insert
 @JobHwId NVARCHAR(200),@Unit NVARCHAR(50),@PostType NVARCHAR(300),@PostHeight NVARCHAR(100),@PostSize NVARCHAR(100),@Post NVARCHAR(500),@Qty INT,
 @GalPostSupports NVARCHAR(100),@UserUpdate NVARCHAR(200),@FloorLevel NVARCHAR(20)
AS BEGIN SET NOCOUNT ON; INSERT dbo.Beams(unit,ID,PostType,PostHeight,PostSize,Post,Qty,GalPostSupports,IdJob_HW,UserUpdate,DatetimeUpdate,IsOldData,FloorLevel)
 VALUES(@Unit,NEWID(),@PostType,@PostHeight,@PostSize,@Post,@Qty,@GalPostSupports,@JobHwId,@UserUpdate,GETDATE(),0,@FloorLevel); END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_PowerTruss_List
 @Unit NVARCHAR(50)=N'Unit 1',@JobHwId NVARCHAR(200)=NULL,@Office NVARCHAR(50)=NULL
AS
BEGIN SET NOCOUNT ON;
 SELECT ptb.ID AS id,ptb.IdJob_HW AS id_job_hw,ptb.WallHeight AS wall_height,ptb.Length AS length,ptb.Type AS type,ptb.Qty AS qty,
        ptb.FloorLevel AS floor_level,ptb.UserUpdate AS user_update,ptb.DatetimeUpdate AS datetime_update,ptb.IsOldData AS is_old_data,
        tghw.id AS hw_id,tghw.id_job_ems,lj.JobNumber AS job_number
 FROM dbo.PowerTrussBraces ptb
 LEFT JOIN [emsflow].[dbo].[task_group_hw] tghw ON tghw.id=ptb.IdJob_HW AND ISNULL(tghw.is_delete,0)=0
 LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj ON tghw.id_job_ems=lj.IDJob AND ISNULL(lj.IsDelete,0)=0
 LEFT JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj ON tghw.id_assign_ems=aj.ID AND ISNULL(aj.IsDelete,0)=0
 WHERE ISNULL(ptb.IsOldData,0)=0 AND ISNULL(NULLIF(LTRIM(RTRIM(ptb.unit)),N''),N'Unit 1')=@Unit
   AND (@JobHwId IS NULL OR CONVERT(NVARCHAR(200),ptb.IdJob_HW)=@JobHwId OR CONVERT(NVARCHAR(200),tghw.id)=@JobHwId OR CONVERT(NVARCHAR(200),lj.JobNumber)=@JobHwId)
   AND (@Office IS NULL OR UPPER(LTRIM(RTRIM(aj.MaNV)))=UPPER(@Office) OR UPPER(LTRIM(RTRIM(ptb.UserUpdate)))=UPPER(@Office))
 ORDER BY ptb.DatetimeUpdate DESC,ptb.ID; END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_PowerTruss_Archive @JobHwId NVARCHAR(200),@Unit NVARCHAR(50),@UserUpdate NVARCHAR(200) AS
BEGIN SET NOCOUNT ON; UPDATE dbo.PowerTrussBraces SET IsOldData=1,UserUpdate=@UserUpdate,DatetimeUpdate=GETDATE()
 WHERE CONVERT(NVARCHAR(200),IdJob_HW)=@JobHwId AND ISNULL(NULLIF(LTRIM(RTRIM(unit)),N''),N'Unit 1')=@Unit AND ISNULL(IsOldData,0)=0; END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_PowerTruss_Insert @JobHwId NVARCHAR(200),@Unit NVARCHAR(50),@WallHeight NVARCHAR(100),@Length NVARCHAR(100),@Type NVARCHAR(100),@Qty FLOAT,@UserUpdate NVARCHAR(200),@FloorLevel NVARCHAR(20) AS
BEGIN SET NOCOUNT ON; INSERT dbo.PowerTrussBraces(unit,IdJob_HW,WallHeight,Length,Type,Qty,UserUpdate,DatetimeUpdate,IsOldData,FloorLevel)
 VALUES(@Unit,@JobHwId,@WallHeight,@Length,@Type,@Qty,@UserUpdate,GETDATE(),0,@FloorLevel); END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_AreaSummary_List @Unit NVARCHAR(50)=N'Unit 1',@Office NVARCHAR(50)=N'EZE0098' AS
BEGIN SET NOCOUNT ON;
 SELECT ars.ID AS area_summary_id,tghw.id AS IDJob_HW,tghw.id AS hw_id,tghw.id_job_ems,tghw.id_assign_ems,
        ars.FloorLevel AS floor_level,ars.FloorAreaType AS floor_area_type,ars.NetArea AS net_area,ars.Product AS product,ars.short_name,
        ars.UserUpdate AS user_update,ars.DatetimeUpdate AS datetime_update,ars.IsOldData AS is_old_data,lj.JobNumber AS job_number
 FROM [emsflow].[dbo].[task_group_hw] tghw
 LEFT JOIN dbo.AreaSummary ars ON tghw.id=ars.IDJob_HW AND ISNULL(ars.IsOldData,0)=0 AND ISNULL(NULLIF(LTRIM(RTRIM(ars.unit)),N''),N'Unit 1')=@Unit
 LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj ON tghw.id_job_ems=lj.IDJob AND ISNULL(lj.IsDelete,0)=0
 INNER JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj ON tghw.id_assign_ems=aj.ID AND ISNULL(aj.IsDelete,0)=0
 WHERE ISNULL(tghw.is_delete,0)=0 AND (@Office IS NULL OR UPPER(LTRIM(RTRIM(aj.MaNV)))=UPPER(@Office))
 ORDER BY tghw.id DESC,ars.ID DESC; END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_AreaSummary_Archive @JobHwId NVARCHAR(200),@Unit NVARCHAR(50),@UserUpdate NVARCHAR(200) AS
BEGIN SET NOCOUNT ON; UPDATE dbo.AreaSummary SET IsOldData=1,UserUpdate=@UserUpdate,DatetimeUpdate=GETDATE()
 WHERE CONVERT(NVARCHAR(200),IDJob_HW)=@JobHwId AND ISNULL(NULLIF(LTRIM(RTRIM(unit)),N''),N'Unit 1')=@Unit AND ISNULL(IsOldData,0)=0; END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_AreaSummary_Insert
 @JobHwId NVARCHAR(200),@Unit NVARCHAR(50),@FloorLevel NVARCHAR(20),@FloorAreaType NVARCHAR(100),@NetArea FLOAT,@Product NVARCHAR(500),@ShortName NVARCHAR(100),@UserUpdate NVARCHAR(200)
AS BEGIN SET NOCOUNT ON; INSERT dbo.AreaSummary(unit,ID,FloorLevel,FloorAreaType,NetArea,Product,short_name,IDJob_HW,UserUpdate,DatetimeUpdate,IsOldData)
 VALUES(@Unit,NEWID(),@FloorLevel,@FloorAreaType,@NetArea,@Product,@ShortName,@JobHwId,@UserUpdate,GETDATE(),0); END;
GO
