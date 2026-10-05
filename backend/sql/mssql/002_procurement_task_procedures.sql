USE [ProcurementApp];
GO

/*
  EzeFloor Procurement task stored procedures.
  Application routes should only call these procedures; business SQL stays here.
  Unit 1 also covers legacy NULL/blank unit rows.
*/

CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_ResolveJobHw
    @InputValue NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @v NVARCHAR(200)=LTRIM(RTRIM(ISNULL(@InputValue,N'')));

    SELECT TOP (1) tghw.id AS job_hw_id
    FROM [emsflow].[dbo].[task_group_hw] tghw
    LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj
      ON tghw.id_job_ems=lj.IDJob AND ISNULL(lj.IsDelete,0)=0
    WHERE ISNULL(tghw.is_delete,0)=0
      AND (
        CONVERT(NVARCHAR(200),tghw.id)=@v OR
        CONVERT(NVARCHAR(200),tghw.id_job_ems)=@v OR
        LOWER(LTRIM(RTRIM(ISNULL(lj.JobNumber,N''))))=LOWER(@v)
      )
    ORDER BY CASE WHEN CONVERT(NVARCHAR(200),tghw.id)=@v THEN 0
                  WHEN CONVERT(NVARCHAR(200),tghw.id_job_ems)=@v THEN 1 ELSE 2 END,
             tghw.created_at DESC;
END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_FrameWork_List
    @Unit NVARCHAR(50)=N'Unit 1', @Office NVARCHAR(50)=N'EZE0098'
AS
BEGIN
 SET NOCOUNT ON;
 SELECT fw.ID AS framework_id,tghw.id AS IDJob_HW,tghw.id AS hw_id,tghw.id_job_ems,tghw.id_assign_ems,
        fw.WallHeight AS wall_height,fw.WallLength AS wall_length,fw.TheWallAbove AS wall_above,
        fw.Spacing AS spacing,fw.RodSize AS rod_size,fw.short_name,fw.FloorLevel AS floor_level,
        fw.UserUpdate AS user_update,fw.DatetimeUpdate AS datetime_update,fw.IsOldData AS is_old_data,
        lj.JobNumber AS job_number
 FROM [emsflow].[dbo].[task_group_hw] tghw
 LEFT JOIN dbo.FrameWork fw ON tghw.id=fw.IDJob_HW AND ISNULL(fw.IsOldData,0)=0
   AND ISNULL(NULLIF(LTRIM(RTRIM(fw.unit)),N''),N'Unit 1')=@Unit
   AND ISNULL(fw.TheWallAbove,N'')<>N'BUN-VIC UPPER FLOORS'
 LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj ON tghw.id_job_ems=lj.IDJob AND ISNULL(lj.IsDelete,0)=0
 INNER JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj ON tghw.id_assign_ems=aj.ID AND ISNULL(aj.IsDelete,0)=0
 WHERE ISNULL(tghw.is_delete,0)=0 AND (@Office IS NULL OR UPPER(LTRIM(RTRIM(aj.MaNV)))=UPPER(@Office))
 ORDER BY tghw.id DESC;
END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_FrameWork_Archive @JobHwId NVARCHAR(200),@Unit NVARCHAR(50),@UserUpdate NVARCHAR(200) AS
BEGIN SET NOCOUNT ON; UPDATE dbo.FrameWork SET IsOldData=1,UserUpdate=@UserUpdate,DatetimeUpdate=GETDATE()
 WHERE CONVERT(NVARCHAR(200),IDJob_HW)=@JobHwId AND ISNULL(NULLIF(LTRIM(RTRIM(unit)),N''),N'Unit 1')=@Unit AND ISNULL(IsOldData,0)=0; END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_FrameWork_Insert
 @JobHwId NVARCHAR(200),@Unit NVARCHAR(50),@WallHeight FLOAT,@WallLength FLOAT,@TheWallAbove NVARCHAR(100),@Spacing FLOAT,
 @RodSize NVARCHAR(50),@ShortName NVARCHAR(100),@FloorLevel NVARCHAR(20),@UserUpdate NVARCHAR(200)
AS BEGIN SET NOCOUNT ON; INSERT dbo.FrameWork(unit,ID,IDJob_HW,WallHeight,WallLength,TheWallAbove,Spacing,RodSize,short_name,FloorLevel,UserUpdate,DatetimeUpdate,IsOldData)
 VALUES(@Unit,CONVERT(VARCHAR(50),NEWID()),@JobHwId,@WallHeight,@WallLength,@TheWallAbove,@Spacing,@RodSize,@ShortName,@FloorLevel,@UserUpdate,GETDATE(),0); END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_Insulation_List @Unit NVARCHAR(50)=N'Unit 1',@Office NVARCHAR(50)=N'EZE0098' AS
BEGIN SET NOCOUNT ON;
 SELECT ins.ID AS insulation_id,tghw.id AS IdJob_HW,tghw.id AS hw_id,tghw.id_job_ems,tghw.id_assign_ems,
 ins.InsulationType AS insulation_type,ins.InsulationType AS wall_type,ins.Product AS product,ins.WallHeight AS wall_height,
 ins.WallLength AS wall_length,ins.TotalAreaRaked AS total_area_raked,ins.TotalAreaDoor AS total_area_door,ins.RValue AS r_value,
 ins.FloorLevel AS floor_level,ins.short_name,ins.UserUpdate AS user_update,ins.DatetimeUpdate AS datetime_update,ins.IsOldData AS is_old_data,lj.JobNumber AS job_number
 FROM [emsflow].[dbo].[task_group_hw] tghw
 LEFT JOIN dbo.Insulation ins ON tghw.id=ins.IdJob_HW AND ISNULL(ins.IsOldData,0)=0 AND ISNULL(NULLIF(LTRIM(RTRIM(ins.unit)),N''),N'Unit 1')=@Unit
 LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj ON tghw.id_job_ems=lj.IDJob AND ISNULL(lj.IsDelete,0)=0
 INNER JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj ON tghw.id_assign_ems=aj.ID AND ISNULL(aj.IsDelete,0)=0
 WHERE ISNULL(tghw.is_delete,0)=0 AND (@Office IS NULL OR UPPER(LTRIM(RTRIM(aj.MaNV)))=UPPER(@Office))
 ORDER BY tghw.id DESC,ins.ID DESC; END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_Insulation_Archive @JobHwId NVARCHAR(200),@Unit NVARCHAR(50),@UserUpdate NVARCHAR(200) AS
BEGIN SET NOCOUNT ON; UPDATE dbo.Insulation SET IsOldData=1,UserUpdate=@UserUpdate,DatetimeUpdate=GETDATE() WHERE CONVERT(NVARCHAR(200),IdJob_HW)=@JobHwId AND ISNULL(NULLIF(LTRIM(RTRIM(unit)),N''),N'Unit 1')=@Unit AND ISNULL(IsOldData,0)=0; END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_Insulation_Insert
 @JobHwId NVARCHAR(200),@Unit NVARCHAR(50),@InsulationType NVARCHAR(200),@Product NVARCHAR(500),@WallHeight FLOAT,@WallLength FLOAT,@RValue FLOAT,
 @ShortName NVARCHAR(100),@TotalAreaRaked FLOAT,@TotalAreaDoor FLOAT,@FloorLevel NVARCHAR(20),@UserUpdate NVARCHAR(200)
AS BEGIN SET NOCOUNT ON; INSERT dbo.Insulation(unit,ID,InsulationType,Product,WallHeight,WallLength,RValue,IdJob_HW,UserUpdate,DatetimeUpdate,IsOldData,short_name,TotalAreaRaked,TotalAreaDoor,FloorLevel)
 VALUES(@Unit,NEWID(),@InsulationType,@Product,@WallHeight,@WallLength,@RValue,@JobHwId,@UserUpdate,GETDATE(),0,@ShortName,@TotalAreaRaked,@TotalAreaDoor,@FloorLevel); END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_Cladding_List @Unit NVARCHAR(50)=N'Unit 1',@Office NVARCHAR(50)=NULL AS
BEGIN SET NOCOUNT ON;
 SELECT c.ID AS cladding_id,tghw.id AS IDJob_HW,tghw.id AS hw_id,tghw.id_job_ems,tghw.id_assign_ems,c.WallHeight AS wall_height,c.WallLength AS wall_length,
 c.short_name,c.FloorLevel AS floor_level,c.UserUpdate AS user_update,c.DatetimeUpdate AS datetime_update,c.IsOldData AS is_old_data,lj.JobNumber AS job_number
 FROM [emsflow].[dbo].[task_group_hw] tghw
 LEFT JOIN dbo.Cladding c ON tghw.id=c.IdJob_HW AND ISNULL(c.IsOldData,0)=0 AND ISNULL(NULLIF(LTRIM(RTRIM(c.unit)),N''),N'Unit 1')=@Unit
 LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj ON tghw.id_job_ems=lj.IDJob AND ISNULL(lj.IsDelete,0)=0
 INNER JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj ON tghw.id_assign_ems=aj.ID AND ISNULL(aj.IsDelete,0)=0
 WHERE ISNULL(tghw.is_delete,0)=0 AND (@Office IS NULL OR UPPER(LTRIM(RTRIM(aj.MaNV)))=UPPER(@Office)) ORDER BY tghw.id DESC; END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_Cladding_Archive @JobHwId NVARCHAR(200),@Unit NVARCHAR(50),@UserUpdate NVARCHAR(200) AS
BEGIN SET NOCOUNT ON; UPDATE dbo.Cladding SET IsOldData=1,UserUpdate=@UserUpdate,DatetimeUpdate=GETDATE() WHERE CONVERT(NVARCHAR(200),IdJob_HW)=@JobHwId AND ISNULL(NULLIF(LTRIM(RTRIM(unit)),N''),N'Unit 1')=@Unit AND ISNULL(IsOldData,0)=0; END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_Cladding_Insert @JobHwId NVARCHAR(200),@Unit NVARCHAR(50),@WallHeight FLOAT,@WallLength FLOAT,@ShortName NVARCHAR(100),@FloorLevel NVARCHAR(20),@UserUpdate NVARCHAR(200) AS
BEGIN SET NOCOUNT ON; INSERT dbo.Cladding(unit,ID,IdJob_HW,WallHeight,WallLength,short_name,FloorLevel,UserUpdate,DatetimeUpdate,IsOldData)
 VALUES(@Unit,NEWID(),@JobHwId,@WallHeight,@WallLength,@ShortName,@FloorLevel,@UserUpdate,GETDATE(),0); END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_Fixout_List @Unit NVARCHAR(50)=N'Unit 1',@JobHwId NVARCHAR(200)=NULL,@Office NVARCHAR(50)=NULL AS
BEGIN SET NOCOUNT ON;
 SELECT f.ID AS fixout_id,f.IdJob_HW,f.category,f.door_label,f.door_type,f.height,f.width,f.thicks,f.wall_width,f.door_frame,f.lift_off_pivot,f.handing,f.hole,f.finish,f.door_furniture,f.door_stop,f.qty,
 f.FloorLevel AS floor_level,f.UserUpdate AS user_update,f.DatetimeUpdate AS datetime_update,f.IsOldData AS is_old_data,tghw.id AS hw_id,tghw.id_job_ems,lj.JobNumber AS job_number
 FROM dbo.Fixout f LEFT JOIN [emsflow].[dbo].[task_group_hw] tghw ON tghw.id=f.IdJob_HW AND ISNULL(tghw.is_delete,0)=0
 LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj ON tghw.id_job_ems=lj.IDJob AND ISNULL(lj.IsDelete,0)=0
 LEFT JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj ON tghw.id_assign_ems=aj.ID AND ISNULL(aj.IsDelete,0)=0
 WHERE ISNULL(f.IsOldData,0)=0 AND ISNULL(NULLIF(LTRIM(RTRIM(f.unit)),N''),N'Unit 1')=@Unit
 AND (@JobHwId IS NULL OR CONVERT(NVARCHAR(200),f.IdJob_HW)=@JobHwId OR CONVERT(NVARCHAR(200),tghw.id)=@JobHwId OR CONVERT(NVARCHAR(200),lj.JobNumber)=@JobHwId)
 AND (@Office IS NULL OR UPPER(LTRIM(RTRIM(aj.MaNV)))=UPPER(@Office) OR UPPER(LTRIM(RTRIM(f.UserUpdate)))=UPPER(@Office))
 ORDER BY f.DatetimeUpdate DESC,f.ID; END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_Fixout_Archive @JobHwId NVARCHAR(200),@Unit NVARCHAR(50),@UserUpdate NVARCHAR(200) AS
BEGIN SET NOCOUNT ON; SELECT ID FROM dbo.Fixout WITH(UPDLOCK,HOLDLOCK) WHERE CONVERT(NVARCHAR(200),IdJob_HW)=@JobHwId;
 UPDATE dbo.Fixout SET IsOldData=1,UserUpdate=@UserUpdate,DatetimeUpdate=GETDATE() WHERE CONVERT(NVARCHAR(200),IdJob_HW)=@JobHwId AND ISNULL(NULLIF(LTRIM(RTRIM(unit)),N''),N'Unit 1')=@Unit AND ISNULL(IsOldData,0)=0; END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_Fixout_Insert
 @JobHwId NVARCHAR(200),@Unit NVARCHAR(50),@Category NVARCHAR(200),@DoorLabel NVARCHAR(200),@DoorType NVARCHAR(300),@Height FLOAT,@Width FLOAT,@Thicks FLOAT,@WallWidth FLOAT,
 @DoorFrame NVARCHAR(300),@LiftOffPivot NVARCHAR(200),@Handing NVARCHAR(100),@Hole NVARCHAR(200),@Finish NVARCHAR(300),@DoorFurniture NVARCHAR(500),@DoorStop NVARCHAR(300),@Qty FLOAT,@FloorLevel NVARCHAR(20),@UserUpdate NVARCHAR(200)
AS BEGIN SET NOCOUNT ON; INSERT dbo.Fixout(unit,ID,IdJob_HW,category,door_label,door_type,height,width,thicks,wall_width,door_frame,lift_off_pivot,handing,hole,finish,door_furniture,door_stop,qty,UserUpdate,DatetimeUpdate,IsOldData,FloorLevel)
 VALUES(@Unit,NEWID(),@JobHwId,@Category,@DoorLabel,@DoorType,@Height,@Width,@Thicks,@WallWidth,@DoorFrame,@LiftOffPivot,@Handing,@Hole,@Finish,@DoorFurniture,@DoorStop,@Qty,@UserUpdate,GETDATE(),0,@FloorLevel); END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_Fixout_Delete @FixoutId NVARCHAR(200),@UserUpdate NVARCHAR(200) AS
BEGIN SET NOCOUNT ON; UPDATE dbo.Fixout SET IsOldData=1,UserUpdate=@UserUpdate,DatetimeUpdate=GETDATE() WHERE CONVERT(NVARCHAR(200),ID)=@FixoutId AND ISNULL(IsOldData,0)=0; END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_LockUp_List @Unit NVARCHAR(50)=N'Unit 1',@Office NVARCHAR(50)=N'EZE0098',@JobNumber NVARCHAR(200)=NULL AS
BEGIN SET NOCOUNT ON;
 SELECT lock.ID AS lockout_id,tghw.id AS IdJob_HW,tghw.id AS hw_id,tghw.id_job_ems,tghw.id_assign_ems,lock.[mode],lock.[scope],lock.label,lock.door_type,lock.height,lock.width,lock.thickness,
 lock.jamb_or_wall,lock.jamb_size,lock.hung,lock.[type],lock.Weatherguard,lock.DBLRebated,lock.door_stop,lock.internal_type,lock.color,lock.default_qty,lock.short_name,
 lock.UserUpdate AS user_update,lock.DatetimeUpdate AS datetime_update,lock.IsOldData AS is_old_data,lj.JobNumber AS job_number
 FROM [emsflow].[dbo].[task_group_hw] tghw LEFT JOIN dbo.LockUp lock ON tghw.id=lock.IdJob_HW AND ISNULL(lock.IsOldData,0)=0 AND ISNULL(NULLIF(LTRIM(RTRIM(lock.unit)),N''),N'Unit 1')=@Unit
 LEFT JOIN [Ezequotepersonalmanagement].[dbo].[ListJobs] lj ON tghw.id_job_ems=lj.IDJob AND ISNULL(lj.IsDelete,0)=0
 INNER JOIN [Ezequotepersonalmanagement].[dbo].[AssignJob] aj ON tghw.id_assign_ems=aj.ID AND ISNULL(aj.IsDelete,0)=0
 WHERE ISNULL(tghw.is_delete,0)=0 AND (@Office IS NULL OR UPPER(LTRIM(RTRIM(aj.MaNV)))=UPPER(@Office)) AND (@JobNumber IS NULL OR lj.JobNumber=@JobNumber OR CONVERT(NVARCHAR(200),tghw.id)=@JobNumber)
 ORDER BY tghw.id DESC,lock.ID DESC; END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_LockUp_Archive @JobHwId NVARCHAR(200),@Unit NVARCHAR(50),@UserUpdate NVARCHAR(200) AS
BEGIN SET NOCOUNT ON; UPDATE dbo.LockUp SET IsOldData=1,UserUpdate=@UserUpdate,DatetimeUpdate=GETDATE() WHERE CONVERT(NVARCHAR(200),IdJob_HW)=@JobHwId AND ISNULL(NULLIF(LTRIM(RTRIM(unit)),N''),N'Unit 1')=@Unit AND ISNULL(IsOldData,0)=0; END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_LockUp_Insert
 @JobHwId NVARCHAR(200),@Unit NVARCHAR(50),@Mode NVARCHAR(200),@Scope NVARCHAR(200),@Label NVARCHAR(300),@DoorType NVARCHAR(300),@Height FLOAT,@Width FLOAT,@Thickness FLOAT,
 @JambOrWall NVARCHAR(300),@JambSize NVARCHAR(300),@Hung NVARCHAR(200),@Type NVARCHAR(300),@Weatherguard BIT,@DBLRebated BIT,@DoorStop NVARCHAR(300),@InternalType NVARCHAR(200),@Color NVARCHAR(200),@DefaultQty FLOAT,@ShortName NVARCHAR(100),@UserUpdate NVARCHAR(200)
AS BEGIN SET NOCOUNT ON; INSERT dbo.LockUp(unit,ID,[mode],[scope],label,door_type,height,width,thickness,jamb_or_wall,jamb_size,hung,[type],Weatherguard,DBLRebated,door_stop,internal_type,color,default_qty,IdJob_HW,UserUpdate,DatetimeUpdate,IsOldData,short_name)
 VALUES(@Unit,NEWID(),@Mode,@Scope,@Label,@DoorType,@Height,@Width,@Thickness,@JambOrWall,@JambSize,@Hung,@Type,@Weatherguard,@DBLRebated,@DoorStop,@InternalType,@Color,@DefaultQty,@JobHwId,@UserUpdate,GETDATE(),0,@ShortName); END;
GO

CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_CatalogOptions_List
 @CustomerId NVARCHAR(100), @OptionGroup NVARCHAR(100)
AS BEGIN SET NOCOUNT ON;
 SELECT option_value FROM dbo.catalog_options
 WHERE customer_id=@CustomerId AND option_group=@OptionGroup AND is_active=1
 ORDER BY sort_order,id; END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_InternalDoorTypes_List
 @CustomerId NVARCHAR(100), @StartRow INT, @EndRow INT
AS BEGIN SET NOCOUNT ON;
 SELECT door_type,MIN(source_row) AS first_source_row FROM dbo.product_catalog
 WHERE customer_id=@CustomerId AND catalog_type=N'DOOR' AND is_active=1
   AND source_row BETWEEN @StartRow AND @EndRow AND NULLIF(LTRIM(RTRIM(door_type)),N'') IS NOT NULL
 GROUP BY door_type ORDER BY MIN(source_row),door_type; END;
GO
CREATE OR ALTER PROCEDURE dbo.usp_EzeFloor_ExternalDoorTypes_List
 @CustomerId NVARCHAR(100)
AS BEGIN SET NOCOUNT ON;
 SELECT lookup_value FROM dbo.product_catalog
 WHERE customer_id=@CustomerId AND catalog_type=N'ENTRY_DOOR' AND is_active=1 AND lookup_value IS NOT NULL
 ORDER BY source_row,id; END;
GO
