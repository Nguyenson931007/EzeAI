# Hướng dẫn Sử dụng Hệ thống CAD Semantic Canvas - EzeFloor

Chào mừng bạn đến với **EzeFloor** – Hệ thống CAD Semantic Canvas doanh nghiệp đột phá, kết hợp giữa khả năng xử lý vector CAD mạnh mẽ và trí tuệ nhân tạo (YOLO Segmentation/Detection & OCR) để tự động nhận dạng cấu trúc bản vẽ mặt bằng chỉ trong vài giây.

Tài liệu này hướng dẫn chi tiết toàn bộ các tính năng, công cụ vẽ thiết kế, và hệ thống AI thông minh của ứng dụng EzeFloor.

---

## Mục lục
1. [Hệ thống Đăng nhập & Quản trị User](#1-hệ-thống-đăng-nhập--quản-trị-user)
2. [Quản lý Dự án & Lịch sử Công việc](#2-quản-lý-dự-án--lịch-sử-công-việc)
3. [Tải Bản vẽ & Định tỷ lệ Thực tế (Scale Calibration)](#3-tải-bản-vẽ--định-tỷ-lệ-thực-tế-scale-calibration)
4. [Tính năng Tự động Nhận dạng AI (Core AI Pipelines)](#4-tính-năng-tự-động-nhận-dạng-ai-core-ai-pipelines)
   - [Tự động Nhận dạng Phòng (Room Detection)](#tự-động-nhận-dạng-phòng-room-detection)
   - [Tự động Nhận dạng Tường (Wall Detection)](#tự-động-nhận-dạng-tường-wall-detection)
   - [Tự động Nhận dạng Cửa (Door Detection) & Khớp cạnh tường](#tự-động-nhận-dạng-cửa-door-detection--khớp-cạnh-tường)
5. [Vùng Suy luận Cục bộ Nâng cao (ROI Localized Inference)](#5-vùng-suy-luận-cục-bộ-nâng-cao-roi-localized-inference)
6. [Bảng Công cụ CAD Canvas & Thao tác Thủ công](#6-bảng-công-cụ-cad-canvas--thao-tác-thủ-công)
7. [Bảng Điều chỉnh & Sửa lỗi OCR Hai chạm (Double-click OCR Correction Panel)](#7-bảng-điều-chỉnh--sửa-lỗi-ocr-hai-chạm-double-click-ocr-correction-panel)
8. [Bản đồ Thu nhỏ Tương tác Nổi (Floating Minimap)](#8-bản-đồ-thu-nhỏ-tương-tác-nổi-floating-minimap)
9. [Bảng Bóc tách Khối lượng BOQ & Tính toán Chi phí](#9-bảng-bóc-tách-khối-lượng-boq--tính-toán-chi-phí)
10. [Hệ thống Phím tắt Tiện ích](#10-hệ-thống-phím-tắt-tiện-ích)

---

## 1. Hệ thống Đăng nhập & Quản trị User

EzeFloor trang bị hệ thống bảo mật session chặt chẽ:
- **Trang Đăng nhập (Login/Register)**: Người dùng đăng nhập bằng tên tài khoản và mật khẩu. Bạn cũng có thể đăng ký tài khoản mới trực tiếp.
- **Quản lý Session**: Mỗi phiên đăng nhập được cấp một Token ngẫu nhiên lưu trong Cookie của trình duyệt. Máy chủ tự động theo dõi trạng thái online của người dùng và sẽ bắt buộc đăng xuất nếu phiên hết hạn hoặc khi khởi động lại backend.
- **Phân quyền Admin (User Management)**: 
  - Thành viên có quyền `admin` có quyền truy cập tab **Users** để quản lý danh sách người dùng.
  - Quản trị viên có thể kích hoạt/khóa tài khoản, thay đổi quyền hạn (`admin`/`user`), xem trạng thái hoạt động thực tế (Online/Offline) và lịch sử đăng nhập.

---

## 2. Quản lý Dự án & Lịch sử Công việc

EzeFloor cho phép lưu trữ và phục hồi trạng thái làm việc bất kỳ lúc nào:
- **Tab History (Lịch sử Dự án)**:
  - Hiển thị danh sách tất cả các bản vẽ và dự án đã được lưu trữ trong cơ sở dữ liệu SQLite (`ezefloor.db`).
  - Mỗi bản ghi hiển thị tên file bản vẽ, thời gian tạo, kích thước thực tế và tài khoản thực hiện.
- **Lưu dự án (Save Job)**:
  - Khi làm việc trên Canvas, bạn có thể nhấn nút **Save Project** để đóng gói toàn bộ trạng thái hiện tại (bao gồm ảnh bản vẽ, tọa độ phòng, tường, cửa và tỷ lệ scale) và lưu trực tiếp lên server.
- **Tải dự án (Load Job)**:
  - Click đúp hoặc nhấn **Load** từ danh sách lịch sử để khôi phục toàn bộ không gian thiết kế của bạn.

---

## 3. Tải Bản vẽ & Định tỷ lệ Thực tế (Scale Calibration)

Để đo đạc chính xác kích thước bằng milimét thực tế trên ảnh pixel:
1. **Tải bản vẽ**: Click chuột vào vùng tải tệp hoặc kéo thả tệp hình ảnh (PNG, JPG) lên Canvas.
2. **Kích hoạt Thước đo (Scale Tool)**: Nhấp vào nút **Scale Tool** trên thanh công cụ Ribbon.
3. **Vẽ Thước căn chuẩn**: 
   - Click chuột chọn điểm đầu và kéo thả để chọn điểm cuối của một đường thẳng đã biết kích thước thực tế trên bản vẽ vẽ (ví dụ: đoạn tường dài 4000mm).
   - Một hộp thoại hiện ra, bạn nhập kích thước thực tế chính xác bằng milimét (ví dụ: `4000`, lưu ý nhập số nguyên, không dùng dấu chấm hay phẩy).
   - Hệ thống sẽ tự động tính toán hệ số quy đổi tỷ lệ thực tế `realScale` (mét trên mỗi pixel - m/px) dùng để tính toán diện tích và chiều dài cho toàn bộ các đối tượng khác.

---

## 4. Tính năng Tự động Nhận dạng AI (Core AI Pipelines)

EzeFloor được trang bị các mô hình mạng nơ-ron học sâu (Deep Learning YOLO) tiên tiến được tinh chỉnh để trích xuất tự động các phần tử kiến trúc:

### Tự động Nhận dạng Phòng (Room Detection)
- Khi bạn nhấn **AI Room**, mô hình YOLO Segmentation sẽ quét toàn bộ ảnh để khoanh vùng các phòng học, phòng ngủ, phòng khách, phòng tắm, hành lang, v.v. dưới dạng các đa giác (`polygon`).
- **Phân loại Semantics (Dry/Wet)**:
  - Hệ thống tự động phân loại phòng thành **Phòng Khô (Dry)** (Bedroom, Living room, Hall) và **Phòng Ướt (Wet)** (Bathroom, Kitchen, Balcony).
  - Phòng Khô được viền xanh dương mỏng nhẹ, phòng Ướt được viền màu đỏ nhạt để dễ nhận biết.
  - Diện tích phòng ($m^2$) được tính toán tự động dựa trên tọa độ đa giác và hệ số tỷ lệ thực tế của bản vẽ.

### Tự động Nhận dạng Tường (Wall Detection)
- Nhấn **AI Wall** để hệ thống quét và trích xuất tất cả các phân đoạn tường chính.
- Tường được hiển thị dưới dạng các nét đa tuyến (`polyline` hoặc `polygon` khép kín) có độ dày thực tế bằng milimét (ví dụ: tường ngoài 240mm, tường ngăn trong 90mm).
- Bạn có thể tùy chỉnh độ dày, chiều cao và vật liệu tường (Gạch, Gỗ, Bê tông) trong bảng thuộc tính bên phải.

### Tự động Nhận dạng Cửa (Door Detection) & Khớp cạnh tường
- Nhấn **AI Door** để nhận diện các cánh cửa trên bản vẽ.
- **Phân loại loại cửa**: Nhận dạng được cửa đơn (`single`), cửa đôi (`double`), và cửa lùa (`sliding`).
- **OCR Kích thước**: Hệ thống sử dụng một mô hình OCR tự động đọc nhãn văn bản xung quanh cửa để gán đúng kích thước sản xuất thực tế bằng milimét (ví dụ: 820mm, 920mm) thay vì đo pixel thô.
- **Thuật toán Khớp cạnh tường Đỉnh cao (Wall-Edge Peak Detection)**:
   - Các cửa nhận diện thô từ YOLO thường bị lệch ra giữa phòng (do bao gồm cả phần cánh cửa xoay và đường cung nét đứt).
   - EzeFloor tích hợp thuật toán phân tích điểm ảnh tối cực đại nhằm xác định chính xác đường trục của bức tường nằm ở cạnh nào của khung bao cửa (Top/Bottom đối với tường ngang, Left/Right đối với tường đứng).
   - Tọa độ cửa sẽ tự động được hút chuẩn (snap) sát vào khuôn tường thực tế của bản vẽ gốc, triệt tiêu hoàn toàn độ lệch.

---

## 5. Vùng Suy luận Cục bộ Nâng cao (ROI Localized Inference)

Khi bản vẽ quá lớn hoặc bạn muốn cập nhật nhận dạng chỉ riêng một khu vực nhỏ:
1. Nhấn nút **Select ROI** trên thanh Ribbon.
2. Vẽ một hình hộp chữ nhật bao quanh khu vực bạn cần nhận dạng trên Canvas (Vùng ROI sẽ được hiển thị bằng hiệu ứng đường nét đứt kiến chạy "marching ants" nổi bật).
3. **Các Chế độ Trộn ROI (ROI Modes)**:
   - **Replace**: Xóa toàn bộ các đối tượng đã nhận dạng trước đó nằm bên trong vùng chữ nhật ROI này và thay thế bằng kết quả AI nhận dạng mới.
   - **Merge**: Giữ lại các đối tượng cũ và chỉ thêm các đối tượng mới phát hiện được vào khu vực.
   - **Refine**: Chế độ lọc bỏ các vật thể bị cắt một nửa (`partial_object`) ở viền ROI để tăng độ chính xác của đường nối biên.
4. **Bảng chuẩn đoán ROI (Diagnostic Debug Panel)**:
   - Hiển thị logs tiến trình thời gian thực, thời gian suy luận AI (Inference time bằng giây), độ phân giải của crop ảnh và chỉ số tài nguyên GPU/CPU của hệ thống để phân tích hiệu năng.

---

## 6. Bảng Công cụ CAD Canvas & Thao tác Thủ công

Bạn hoàn toàn có thể chỉnh sửa tự do các kết quả tự động của AI hoặc vẽ mới hoàn toàn bằng bộ công cụ thủ công mạnh mẽ:
- **Di chuyển điểm (Vertex Dragging)**:
  - Khi chọn một Phòng hoặc Tường, tất cả các nút điểm sẽ xuất hiện các tay cầm hình tròn màu trắng.
  - Bạn có thể nhấp chuột và kéo các nút này để điều chỉnh chính xác biên dạng phòng/tường theo thiết kế mới.
- **Vẽ phòng (Draw Room)**: Chọn công cụ và click chuột để vẽ các đỉnh đa giác. Nhấn **Enter** hoặc nhấp đúp để hoàn thành phòng kín.
- **Vẽ tường (Draw Wall)**: Click chuột để vẽ đường trục tường. Bảng bên phải cho phép thay đổi độ dày tường trong khi vẽ.
- **Vẽ cửa (Draw Door)**: Click chuột vào một đoạn tường để tự động đặt cửa chính xác dọc theo trục tường đó.
- **Bắt điểm & Khớp góc (Angle Snapping & Hinge customization)**:
  - Giữ phím **Shift** hoặc bật **Snap Mode** để hệ thống tự động khóa góc xoay của các phân đoạn theo bước nhảy $45^\circ$ hoặc $90^\circ$ (hoàn hảo cho việc vẽ phòng vuông góc nhanh).
  - Trong bảng thuộc tính bên phải đối với Cửa, bạn có thể chỉnh hướng mở cửa (bên Trái/bên Phải - hinge side) và xoay cánh cửa vào trong hay ra ngoài phòng (`swing: inward/outward`).
- **Thước đo khoảng cách (Distance Tool)**: Click 2 điểm bất kỳ trên Canvas để đo khoảng cách và tạo ra nhãn đo trực quan có đường dóng offset tương tự bản vẽ kỹ thuật chuyên nghiệp.

---

## 7. Bảng Điều chỉnh & Sửa lỗi OCR Hai chạm (Double-click OCR Correction Panel)

Để điều chỉnh nhãn tên phòng bị AI đọc sai:
1. **Click đúp chuột** vào nhãn văn bản của phòng trên Canvas.
2. Một bảng điều khiển Glassmorphic tinh tế sẽ hiện ra đè lên nhãn phòng:
   - Nhập tên phòng chính xác vào ô nhập liệu (ví dụ: `BEDROOM 3`, `KITCHEN`).
   - Nút **Apply globally**: Nếu chọn, hệ thống sẽ tự động sửa đổi tất cả các phòng khác có cùng tên sai trước đó thành tên mới này trong cơ sở dữ liệu.
3. Nhấp vào nút **✓** hoặc nhấn **Enter** để lưu tên mới. Nhấn nút **×** hoặc **Esc** để hủy bỏ thao tác.

---

## 8. Bản đồ Thu nhỏ Tương tác Nổi (Floating Minimap)

Nằm ở góc của màn hình làm việc:
- **Minimap** hiển thị một bản đồ thu nhỏ toàn cảnh của bản vẽ mặt bằng hiện tại.
- Một khung hình chữ nhật mờ hiển thị khung nhìn thực tế (viewport) hiện tại của bạn trên màn hình chính.
- Bạn có thể **click và rê chuột** trực tiếp trên Minimap để điều hướng, phóng to, hoặc di chuyển vị trí canvas vô cùng nhanh chóng trên những bản vẽ lớn mà không cần kéo thanh cuộn.

---

## 9. Bảng Bóc tách Khối lượng BOQ & Tính toán Chi phí

Nhấp vào tab **BOQ Table** trên Ribbon để mở bảng Dự toán Vật liệu & Dự toán Chi phí chuyên nghiệp:
- **Bảng bóc tách phòng (Room BOQ)**: Liệt kê diện tích sàn, chu vi của từng phòng, tự động nhân hệ số định mức để tính lượng gạch lát nền và diện tích trần thạch cao.
- **Bảng bóc tách tường (Wall BOQ)**: Tính toán tổng diện tích tường đứng. Dựa trên chất liệu tường đã chọn:
  - **Timber (Tường gỗ)**: Tính khối lượng gỗ khung, tấm gỗ ốp m2 và chi phí nhân công tương ứng.
  - **Brick (Tường gạch)**: Tính số lượng viên gạch đất nung tiêu chuẩn, thể tích vữa xây và cát.
  - **Plasterboard (Tường thạch cao)**: Tính số lượng tấm thạch cao hai mặt và khung xương kim loại.
- **Xuất dữ liệu (Export)**: Cho phép kết xuất toàn bộ dữ liệu bảng BOQ ra tệp **Excel (.xlsx)** hoặc xuất bản báo cáo ra tệp **PDF** chuyên nghiệp để gửi cho khách hàng và đối tác.

---

## 10. Hệ thống Phím tắt Tiện ích

Để tối ưu hóa tốc độ làm việc của các kỹ sư kiến trúc, EzeFloor cung cấp hệ thống phím tắt sau:
- **`Space` (Giữ phím cách)**: Chuyển đổi nhanh sang chế độ Di chuyển Canvas (Pan Mode). Giữ phím cách và kéo chuột để di chuyển canvas tự do.
- **`Shift` (Giữ Shift)**: Bật chế độ khóa góc vẽ vuông $45^\circ / 90^\circ$ và khóa snap điểm nút.
- **`Escape` (Phím Esc)**: Hủy bỏ công cụ vẽ đang chọn, đóng tất cả các bảng nhập liệu nổi hoặc xóa vùng lựa chọn ROI hiện tại.
- **`Enter`**: Hoàn thành và khép kín đa giác phòng hoặc chuỗi tường đang vẽ dở.
- **`Delete` / `Backspace`**: Xóa đối tượng đang được chọn (Phòng, Tường hoặc Cửa) khỏi canvas làm việc.
- **`Ctrl + Z`**: Hoàn tác (Undo) hành động trước đó.
- **`Ctrl + Y` / `Ctrl + Shift + Z`**: Làm lại (Redo) hành động vừa hoàn tác.
