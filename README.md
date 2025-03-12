# Curve Puzzle CAPTCHA - Static Demo Version / 曲线拼图验证码 - 静态演示版


### **Next CAPTCHA: Curve-Puzzle-CAPTCHA**


[English](#english) | [中文](#中文)

**Access Link / 访问链接:** [https://kexinoh.github.io/Curve-Puzzle-CAPTCHA/](https://kexinoh.github.io/Curve-Puzzle-CAPTCHA/)

## English

### Project Overview

This is a purely front-end implemented curve puzzle CAPTCHA, Users need to complete the puzzle by dragging the slider to verify their identity.

### Features

- Uses Canvas to draw puzzles and curves
- Performance optimization for low-performance devices
- Optional display of curves and control points
- Uses color backgrounds to avoid network image loading issues

### Why It's Hard for Machines to Crack

• **Continuous Operation**: Requires the AI to persistently recognize the slider.  
• **Abnormal Interruption**: Continuous recognition introduces a certain delay at each position, thereby distinguishing humans from AI.  
• **Increased Complexity**: Further escalates the recognition cost required by the AI.

### Usage

1. Clone or download this project locally.
2. Open the `index.html` file to view the demo.

### File Structure

- `index.js`: Main logic file containing the CAPTCHA implementation.
- `index.css`: Stylesheet defining the CAPTCHA styles.
- `index.html`: Demo page containing the necessary HTML structure.

### Contribution

Contributions are welcome! Please submit a Pull Request or Issue to help improve the project.

### License

This project is licensed under the MIT License.

### References

```bibtex
@misc{curvepuzzlecaptcha,
title={Curve Puzzle CAPTCHA},
howpublished={\url{https://github.com/kexinoh/Curve-Puzzle-CAPTCHA}},
note={Accessed: 2023-10-15}
}
```


## 中文

### 项目简介

这是一个纯前端实现的曲线拼图验证码用于展示。用户需要通过拖动滑块来完成拼图，以验证其身份。

### 功能特性

- 使用Canvas绘制拼图和曲线
- 支持低性能设备的性能优化
- 提供可选的曲线和控制点显示
- 使用颜色背景，避免网络图片加载问题

### 为什么机器难以破解

- **持续操作**：需要AI持续对滑块进行识别。
- **异常中断**：持续识别会导致每一个位置出现一定的延迟，从而可以区分出人类与AI。
- **增大复杂度**: 可以进一步的消耗AI所需花费的识别成本。


### 使用方法

1. 克隆或下载本项目到本地。
2. 打开`index.html`文件即可查看演示效果。

### 文件结构

- `index.js`: 主逻辑文件，包含验证码的实现。
- `index.css`: 样式文件，定义了验证码的样式。
- `index.html`: 演示页面，包含必要的HTML结构。

### 贡献

欢迎对本项目进行贡献！请提交Pull Request或Issue以帮助改进。

### 许可证

本项目采用MIT许可证。
