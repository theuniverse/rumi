# Video Metadata Extraction Feature

## 概述

Video Analyzer 现在支持从上传的视频文件中自动提取元数据，包括：
- 📅 **录制时间** (Creation Time)
- 📍 **GPS位置** (Latitude/Longitude)
- 📱 **设备信息** (Device Make/Model)
- ⏱️ **视频时长** (Duration)

## 功能特性

### 自动提取
- 上传视频时自动提取元数据
- 无需手动输入录制时间和地点
- 支持多种视频格式（MP4, MOV, M4V等）

### 智能显示
- 在分析结果中显示提取的元数据
- 时间格式化为本地时区
- GPS坐标精确到5位小数
- 设备信息友好展示

### 数据保存
- 保存录制时自动使用视频元数据
- GPS坐标存储到 `recordings.latitude/longitude`
- 录制时间存储到 `recordings.started_at`
- 与手动录制的数据结构完全兼容

## 技术实现

### 后端 (Python)

#### 元数据提取函数
```python
def _extract_video_metadata(file_path: str) -> dict:
    """使用 ffprobe 提取视频元数据"""
    # 返回: created_at, latitude, longitude, device, duration
```

#### GPS坐标解析
```python
def _parse_gps_string(location: str) -> tuple[Optional[float], Optional[float]]:
    """解析多种GPS格式"""
    # 支持 iPhone 格式: +31.2345+121.4567/
    # 支持标准格式: 31.2345, 121.4567
```

#### API响应扩展
```json
{
  "bpm": 128,
  "genre_hint": "Tech House",
  "confidence": 0.8,
  "stability": 0.9,
  "audio_url": "/storage/uploads/...",
  "metadata": {
    "created_at": "2024-03-15T14:30:00Z",
    "latitude": 31.230416,
    "longitude": 121.473701,
    "device": "Apple iPhone 15 Pro",
    "duration": 125.5
  }
}
```

### 前端 (TypeScript/React)

#### 类型定义
```typescript
interface VideoMetadata {
  created_at?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  device?: string | null;
  duration?: number | null;
}

interface AnalysisResult {
  bpm: number;
  genre_hint: string;
  confidence: number;
  stability: number;
  audio_url?: string | null;
  metadata?: VideoMetadata;  // 新增
}
```

#### UI显示
- 在分析结果卡片中显示元数据区域
- 使用图标和格式化展示
- 仅在有元数据时显示该区域

#### 数据使用
```typescript
// 保存时使用视频元数据
const metadata = uploadResult.metadata || {};
const recording = await startRecording({
  session_id: session.id,
  source: "video",
  latitude: metadata.latitude ?? null,
  longitude: metadata.longitude ?? null,
});
```

## 支持的元数据格式

### iPhone/iPad
- ✅ 完整支持
- 元数据标签：
  - `creation_time` 或 `com.apple.quicktime.creationdate`
  - `location` 或 `com.apple.quicktime.location.ISO6709`
  - `make` 或 `com.apple.quicktime.make`
  - `model` 或 `com.apple.quicktime.model`

### Android
- ✅ 大部分支持
- 元数据可用性取决于制造商
- 通常包含时间和设备信息
- GPS可能需要特定相机应用

### 专业相机
- ⚠️ 部分支持
- 通常包含时间和设备信息
- 少数型号支持GPS（需要GPS模块）

### 屏幕录制/下载视频
- ⚠️ 有限支持
- 通常只有时间信息
- 一般不包含GPS数据

## 测试

### 单元测试

运行GPS解析测试：
```bash
python3 scripts/test_metadata_extraction.py
```

测试覆盖：
- ✅ iPhone GPS格式解析
- ✅ 标准GPS格式解析
- ✅ 负坐标处理
- ✅ 无效输入处理

### 生成测试视频

需要先安装 ffmpeg：
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg
```

生成测试视频：
```bash
python3 scripts/add_metadata_to_test_audio.py
```

这将创建4个测试视频：
1. `test_iphone_shanghai.mp4` - 完整元数据（上海）
2. `test_android_beijing.mp4` - 完整元数据（北京）
3. `test_no_gps.mp4` - 仅时间，无GPS
4. `test_no_metadata.mp4` - 无元数据

### 手动测试

1. 启动后端服务：
   ```bash
   cd backend
   uvicorn main:app --reload
   ```

2. 启动前端：
   ```bash
   cd frontend
   npm run dev
   ```

3. 访问 Video Analyzer 页面

4. 上传测试视频或真实视频

5. 验证元数据显示和保存功能

## 验证元数据

使用 ffprobe 检查视频元数据：
```bash
ffprobe -v quiet -print_format json -show_format video.mp4
```

查找这些字段：
```json
{
  "format": {
    "tags": {
      "creation_time": "2024-03-15T14:30:00.000000Z",
      "location": "+31.230416+121.473701/",
      "make": "Apple",
      "model": "iPhone 15 Pro"
    }
  }
}
```

## 故障排除

### 元数据未提取

**问题**: 上传视频后没有显示元数据

**解决方案**:
1. 检查后端日志是否有错误
2. 验证 ffprobe 是否安装：`ffprobe -version`
3. 确认视频文件确实包含元数据
4. 某些视频格式可能不支持所有元数据字段

### GPS坐标不显示

**问题**: 时间和设备信息显示，但GPS不显示

**原因**:
- 录制时未启用定位服务
- 设备不支持GPS标记
- 视频经过处理，元数据被清除

**验证**:
```bash
ffprobe -v quiet -print_format json -show_format video.mp4 | grep location
```

### ffmpeg未找到

**问题**: 后端报错 "ffmpeg not found"

**解决方案**:
```bash
# 安装 ffmpeg
brew install ffmpeg  # macOS
sudo apt-get install ffmpeg  # Ubuntu

# 验证安装
ffmpeg -version
ffprobe -version
```

## 隐私考虑

### GPS数据
- 视频中的GPS数据可能暴露录制地点
- 用户应了解上传视频会提取GPS信息
- 建议添加隐私提示或选项

### 设备信息
- 设备型号信息相对安全
- 但可能用于设备指纹识别

### 建议
- 考虑添加"清除元数据"选项
- 提供元数据预览，让用户决定是否保存
- 在隐私政策中说明元数据处理

## 未来改进

### 短期
- [ ] 添加元数据预览/编辑功能
- [ ] 支持批量上传和元数据提取
- [ ] 添加元数据清除选项

### 中期
- [ ] 反向地理编码（GPS → 地址）
- [ ] 地图显示录制位置
- [ ] 时区自动检测和转换

### 长期
- [ ] 从音频文件提取元数据
- [ ] 支持更多元数据字段（曝光、ISO等）
- [ ] 元数据搜索和过滤功能

## 相关文件

### 后端
- `backend/routers/analyze.py` - 元数据提取逻辑
- `backend/requirements.txt` - 依赖（无需新增）

### 前端
- `frontend/src/pages/VideoAnalyzer.tsx` - UI和数据处理
- `frontend/src/lib/types.ts` - 类型定义
- `frontend/src/lib/db.ts` - 数据库操作

### 测试
- `scripts/test_metadata_extraction.py` - 单元测试
- `scripts/add_metadata_to_test_audio.py` - 测试视频生成
- `scripts/generate_test_video_with_metadata.py` - 备用生成脚本
- `test-videos/README.md` - 测试指南

### 文档
- `docs/VIDEO_METADATA_FEATURE.md` - 本文档

## 总结

✅ **已完成**:
- 后端元数据提取功能
- 前端显示和使用元数据
- GPS坐标解析（多种格式）
- 单元测试
- 测试工具和文档

✅ **测试验证**:
- GPS解析：7/7 测试通过
- 支持iPhone、Android等多种格式
- 优雅处理缺失元数据

🎯 **即可使用**:
- 功能完整，可立即投入使用
- 需要 ffmpeg（后端已依赖）
- 兼容现有数据结构
- 无需数据库迁移

📝 **使用建议**:
- 使用真实手机视频测试
- 检查隐私设置
- 考虑添加用户提示
