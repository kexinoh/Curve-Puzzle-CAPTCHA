/**
 * 曲线拼图验证码 - 静态演示版
 * 无需后端依赖，纯前端实现
 */

document.addEventListener('DOMContentLoaded', () => {
    // 配置参数
    const PUZZLE_CONFIG = {
        radius: 10,
        size: 50,
        canvasWidth: 400,
        canvasHeight: 250,
        curve: {
            points: 5,              // 控制点数量
            yMargin: 0.2,          // y轴边距比例（上下各预留20%）
            resolution: 100,        // 曲线采样点数量
            lengthMultiplier: 1.5   // 曲线长度与滑块距离的比例
        }
    };

    // 性能优化配置
    const PERFORMANCE_CONFIG = {
        throttleDelay: 16,         // 约60fps的更新频率
        animationFrameRate: 60,    // 动画帧率限制
        useLowQualityMode: false   // 低质量模式标志
    };

    // 本地图片集 - 改为使用颜色背景，避免网络图片加载问题
    const backgroundColors = [
        '#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6'
    ];

    // 状态变量
    let puzzleState = {
        number: null,
        centerX: null,
        centerY: null,
        imgData: null,
        isMatch: false,
        moveX: 0,
        dragStartX: 0,
        dragEndX: 0,
        isDragging: false,
        curvePath: null,
        targetX: null,
        targetY: null,
        currentImageIndex: 0,
        showCurveAndPoints: false // 是否显示曲线和控制点
    };

    // 缓存一些频繁使用的元素和上下文
    let lastRenderTime = 0;

    // 确保DOM结构正确
    initializeDom();

    // 获取DOM元素 - 确保DOM元素已经存在
    const $dragBtn = document.querySelector('.yan_drag_btn');
    const $dragArea = document.querySelector('.yan_drag');
    const $moved = document.querySelector('.moved');
    const $dragText = document.querySelector('.yan_drag_text');

    // 获取Canvas上下文
    const canvas = {
        img: document.getElementById('yan_img2'),
        overlay: document.getElementById('yan_ceng')
    };

    // 确保所有DOM元素存在
    if (!canvas.img || !canvas.overlay || !$dragBtn || !$dragArea || !$moved || !$dragText) {
        console.error('无法找到必要的DOM元素：', {
            'yan_img2': !!canvas.img,
            'yan_ceng': !!canvas.overlay,
            'yan_drag_btn': !!$dragBtn,
            'yan_drag': !!$dragArea,
            'moved': !!$moved,
            'yan_drag_text': !!$dragText
        });
        return;
    }

    const ctx = {
        img: canvas.img.getContext('2d'),
        overlay: canvas.overlay.getContext('2d')
    };

    // 创建图像对象
    const img = new Image();

    // 显示拼图层
    document.querySelector('.yan_ceng').style.display = 'block';

    // 检测设备性能
    detectLowPerformanceDevice();

    // 设置事件监听
    setupEvents();

    // 初始化验证码
    resetPuzzle();

    /**
     * 创建必要的DOM元素
     */
    function initializeDom() {
        // 由于HTML文件中已经存在所需的DOM结构，我们只需获取引用而不创建新元素
        console.log('使用现有DOM结构...');

        // 修复Canvas的zIndex，确保叠加顺序正确
        const imgCanvas = document.getElementById('yan_img2');
        if (imgCanvas) {
            imgCanvas.style.position = 'absolute';
            imgCanvas.style.top = '0';
            imgCanvas.style.left = '0';
            imgCanvas.style.zIndex = '1';
        }

        const overlayCanvas = document.getElementById('yan_ceng');
        if (overlayCanvas) {
            overlayCanvas.style.position = 'absolute';
            overlayCanvas.style.top = '0';
            overlayCanvas.style.left = '0';
            overlayCanvas.style.zIndex = '2';
        }

        // 添加曲线显示开关
        const controlsContainer = document.querySelector('.yan_drag_text');
        if (controlsContainer) {
            const toggleContainer = document.createElement('div');
            toggleContainer.style.marginTop = '40px';
            toggleContainer.style.display = 'flex';
            toggleContainer.style.alignItems = 'center';
            toggleContainer.style.justifyContent = 'center';

            const toggleLabel = document.createElement('label');
            toggleLabel.textContent = '显示辅助线: ';
            toggleLabel.style.marginRight = '5px';
            toggleLabel.style.fontSize = '12px';
            toggleLabel.style.color = '#666';

            const toggleSwitch = document.createElement('input');
            toggleSwitch.type = 'checkbox';
            toggleSwitch.checked = false;
            toggleSwitch.id = 'curve_toggle';

            toggleSwitch.addEventListener('change', function() {
                puzzleState.showCurveAndPoints = this.checked;

                // 更新曲线和点的显示状态
                const curveCanvas = document.getElementById('curve_path');
                if (curveCanvas) {
                    curveCanvas.style.display = this.checked ? 'block' : 'none';
                }
            });

            toggleContainer.appendChild(toggleLabel);
            toggleContainer.appendChild(toggleSwitch);
            controlsContainer.parentNode.appendChild(toggleContainer);
        }

        console.log('DOM初始化完成');
    }

    /**
     * 自动检测低配设备
     */
    function detectLowPerformanceDevice() {
        const startTime = performance.now();
        let count = 0;
        for (let i = 0; i < 1000000; i++) {
            count += i;
        }
        const duration = performance.now() - startTime;

        if (duration > 50) {
            console.log("检测到低性能设备，启用性能优化...");
            PERFORMANCE_CONFIG.useLowQualityMode = true;
            PERFORMANCE_CONFIG.throttleDelay = 20;
            PERFORMANCE_CONFIG.animationFrameRate = 15;
            PUZZLE_CONFIG.curve.resolution = 50;
        }
    }

    /**
     * 节流函数
     */
    function throttle(func, delay) {
        let lastCall = 0;
        return function(...args) {
            const now = Date.now();
            if (now - lastCall >= delay) {
                lastCall = now;
                return func.apply(this, args);
            }
        };
    }

    /**
     * 设置事件监听
     */
    function setupEvents() {
        // 创建一次性的节流函数
        const throttledDragMove = throttle(handleDragMove, PERFORMANCE_CONFIG.throttleDelay);

        // 鼠标事件
        $dragBtn.addEventListener('mousedown', handleDragStart);
        $dragArea.addEventListener('mousemove', throttledDragMove);
        document.addEventListener('mouseup', handleDragEnd);

        // 触摸事件 - 使用同一个节流函数
        $dragBtn.addEventListener('touchstart', function(e) {
            e.preventDefault();
            handleDragStart(e.touches[0]);
        });

        $dragArea.addEventListener('touchmove', function(e) {
            e.preventDefault();
            throttledDragMove(e.touches[0]);
        });

        document.addEventListener('touchend', handleDragEnd);
    }

    /**
     * 处理拖动开始
     */
    function handleDragStart(e) {
        console.log('拖动开始');
        if (puzzleState.isMatch) return;

        puzzleState.isDragging = true;
        puzzleState.dragStartX = $dragBtn.getBoundingClientRect().left;
        puzzleState.dragEndX = puzzleState.dragStartX + PUZZLE_CONFIG.canvasWidth - PUZZLE_CONFIG.size;
        $dragBtn.textContent = '<->';
    }

    /**
     * 处理拖动移动
     */
    function handleDragMove(e) {
        if (!puzzleState.isDragging) return;

        const x = e.clientX || e.pageX;
        const btnRect = $dragBtn.getBoundingClientRect();
        const areaRect = $dragArea.getBoundingClientRect();

        // 计算相对于拖动区域的位置
        const relativeX = x - areaRect.left;

        // 限制在有效范围内
        if (relativeX >= 0 && relativeX <= areaRect.width - btnRect.width) {
            puzzleState.moveX = relativeX;

            // 使用transform替代left属性，提高性能
            $dragBtn.style.transform = `translateX(${puzzleState.moveX}px)`;
            $moved.style.width = puzzleState.moveX + 'px';

            // 使用节流控制更新频率
            const now = performance.now();
            if (now - lastRenderTime >= 1000 / PERFORMANCE_CONFIG.animationFrameRate) {
                lastRenderTime = now;
                updatePuzzlePiece();
            }
        }
    }

    /**
     * 处理拖动结束
     */
    function handleDragEnd() {
        if (!puzzleState.isDragging) return;

        puzzleState.isDragging = false;
        $dragBtn.textContent = '|||';

        const position = getPositionOnCurve(puzzleState.moveX);
        const isXMatch = Math.abs(position.x - puzzleState.targetX) <= 5;
        const isYMatch = Math.abs(position.y - puzzleState.targetY) <= 5;

        if (isXMatch && isYMatch) {
            // 验证成功
            puzzleState.isMatch = true;
            $dragText.textContent = '验证成功!';
            $dragText.style.color = '#7ac23c';
            $dragBtn.style.backgroundColor = '#7ac23c';
            $dragBtn.style.color = 'white';

            // 3秒后重置
            setTimeout(resetPuzzle, 3000);
        } else {
            // 验证失败
            $dragText.textContent = '验证失败，请重试!';
            $dragText.style.color = '#e74c3c';

            // 震动效果
            const original = parseInt($dragBtn.style.left) || 0;
            const steps = [10, -20, 15, -10, 5, 0];
            let i = 0;

            const shake = () => {
                if (i < steps.length) {
                    $dragBtn.style.left = (original + steps[i]) + 'px';
                    i++;
                    setTimeout(shake, 50);
                } else {
                    // 重置
                    setTimeout(resetPuzzle, 1000);
                }
            };

            shake();
        }
    }

    /**
     * 重置拼图
     */
    function resetPuzzle() {
        console.log('重置拼图...');

        // 清理Canvas但保留图像
        cleanupCanvases();

        // 生成曲线路径
        puzzleState.curvePath = generateSmoothCurvePath();

        // 选择目标点
        const targetPoint = selectTargetPoint(puzzleState.curvePath);
        puzzleState.targetX = targetPoint.x;
        puzzleState.targetY = targetPoint.y;

        // 设置拖动区域范围
        puzzleState.dragStartX = 0;
        puzzleState.dragEndX = PUZZLE_CONFIG.canvasWidth - 50; // 减去滑块宽度

        // 随机生成背景 - 使用随机图片或纯色
        puzzleState.currentImageIndex = Math.floor(Math.random() * backgroundColors.length);

        // 绘制背景
        drawBackground();

        // 绘制目标拼图
        drawTargetPuzzle();

        // 绘制曲线路径
        if (puzzleState.showCurveAndPoints !== false) {
            drawCurvePath();
        }

        // 重置滑块位置
        $dragBtn.style.left = '0px';
        $moved.style.width = '0px';
        $dragText.textContent = '拖动滑块进行验证';
        $dragText.style.color = '';

        console.log('验证码重置完成');
    }

    /**
     * 绘制背景
     */
    function drawBackground() {
        console.log('绘制背景...');

        // 使用背景图片 - 从HTML中的img元素获取src
        const imgElement = document.getElementById('yan_img');
        if (imgElement && imgElement.src) {
            // 设置图片源并等待加载
            img.src = imgElement.src;

            // 图片加载完成后绘制
            if (img.complete) {
                ctx.img.drawImage(img, 0, 0, PUZZLE_CONFIG.canvasWidth, PUZZLE_CONFIG.canvasHeight);
                console.log('背景图片绘制完成');
            } else {
                // 如果图像尚未加载，等待它加载完成
                img.onload = function() {
                    ctx.img.drawImage(img, 0, 0, PUZZLE_CONFIG.canvasWidth, PUZZLE_CONFIG.canvasHeight);
                    console.log('背景图片加载并绘制完成');

                    // 重新绘制目标拼图，确保它在背景之上
                    drawTargetPuzzle();
                };

                // 添加错误处理
                img.onerror = function() {
                    console.error('背景图片加载失败，使用纯色背景替代');
                    // 回退到纯色背景
                    const color = backgroundColors[puzzleState.currentImageIndex];
                    ctx.img.fillStyle = color;
                    ctx.img.fillRect(0, 0, PUZZLE_CONFIG.canvasWidth, PUZZLE_CONFIG.canvasHeight);
                };

                console.log('等待背景图片加载...');
            }
        } else {
            console.warn('找不到背景图片元素，使用纯色背景替代');
            // 使用纯色背景作为备选
            const color = backgroundColors[puzzleState.currentImageIndex];
            ctx.img.fillStyle = color;
            ctx.img.fillRect(0, 0, PUZZLE_CONFIG.canvasWidth, PUZZLE_CONFIG.canvasHeight);
        }
    }

    /**
     * 绘制目标拼图
     */
    function drawTargetPuzzle() {
        console.log('绘制目标拼图...');

        // 保存当前状态
        ctx.img.save();

        // 添加样式
        ctx.img.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.img.shadowBlur = 5;
        ctx.img.shadowOffsetX = 2;
        ctx.img.shadowOffsetY = 2;
        ctx.img.lineWidth = 2;
        ctx.img.strokeStyle = 'rgba(255, 255, 255, 0.8)';

        // 绘制拼图形状路径
        ctx.img.beginPath();
        puzzleState.number = drawPuzzleShape(ctx.img, puzzleState.targetX, null, puzzleState.targetY);
        ctx.img.closePath();
        ctx.img.stroke();  // 先描边
        ctx.img.clip();    // 然后剪切

        // 直接获取拼图区域的图像数据 - 与index.js保持一致
        puzzleState.imgData = ctx.img.getImageData(
            puzzleState.targetX,
            puzzleState.targetY - PUZZLE_CONFIG.radius,
            PUZZLE_CONFIG.size + PUZZLE_CONFIG.radius + 1,
            PUZZLE_CONFIG.size + 2*PUZZLE_CONFIG.radius + 1
        );

        console.log('图像数据获取成功:',
            puzzleState.targetX,
            puzzleState.targetY - PUZZLE_CONFIG.radius,
            PUZZLE_CONFIG.size + PUZZLE_CONFIG.radius + 1,
            PUZZLE_CONFIG.size + 2*PUZZLE_CONFIG.radius + 1
        );

        // 使目标拼图区域可见
        ctx.img.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.img.fillRect(0, 0, PUZZLE_CONFIG.canvasWidth, PUZZLE_CONFIG.canvasHeight);

        ctx.img.restore();

        // 绘制目标拼图轮廓
        drawTargetPuzzleOutline();

        // 初始化拼图位置
        updatePuzzlePiece();
    }

    /**
     * 绘制目标拼图轮廓
     */
    function drawTargetPuzzleOutline() {
        // 清理旧的轮廓Canvas
        if (document.getElementById('target_outline')) {
            document.getElementById('target_outline').remove();
        }

        const outlineCanvas = document.createElement('canvas');
        outlineCanvas.id = 'target_outline';
        outlineCanvas.width = PUZZLE_CONFIG.canvasWidth;
        outlineCanvas.height = PUZZLE_CONFIG.canvasHeight;
        outlineCanvas.style.position = 'absolute';
        outlineCanvas.style.top = '0';
        outlineCanvas.style.left = '0';
        outlineCanvas.style.zIndex = '3';
        outlineCanvas.style.pointerEvents = 'none';

        // 找到正确的父容器
        const container = document.querySelector('.yan_ceng');
        if (!container) {
            console.error('找不到容器元素 .yan_ceng');
            return;
        }
        container.appendChild(outlineCanvas);

        const outlineCtx = outlineCanvas.getContext('2d');

        // 添加样式
        outlineCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        outlineCtx.shadowBlur = 5;
        outlineCtx.shadowOffsetX = 2;
        outlineCtx.shadowOffsetY = 2;
        outlineCtx.lineWidth = 2;
        outlineCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';

        // 绘制轮廓
        outlineCtx.beginPath();
        // 使用完整的拼图形状绘制，不需要提前移动到起点
        drawPuzzleShape(outlineCtx, puzzleState.targetX, puzzleState.number, puzzleState.targetY);
        outlineCtx.closePath();
        outlineCtx.stroke();
    }

    /**
     * 清理所有Canvas和状态
     */
    function cleanupCanvases() {
        // 清理曲线路径Canvas
        if (document.getElementById('curve_path')) {
            document.getElementById('curve_path').remove();
        }

        // 清理目标轮廓Canvas
        if (document.getElementById('target_outline')) {
            document.getElementById('target_outline').remove();
        }

        // 清理拼图Canvas但不删除元素本身
        if (ctx.img && ctx.overlay) {
            ctx.img.clearRect(0, 0, PUZZLE_CONFIG.canvasWidth, PUZZLE_CONFIG.canvasHeight);
            ctx.overlay.clearRect(0, 0, PUZZLE_CONFIG.canvasWidth, PUZZLE_CONFIG.canvasHeight);
        }

        // 重置状态
        puzzleState.isMatch = false;
        puzzleState.moveX = 0;
        if ($dragBtn) $dragBtn.style.left = '0px';
        if ($moved) $moved.style.width = '0px';
        if ($dragText) $dragText.textContent = '拖动滑块进行验证';
    }

    /**
     * 绘制拼图形状 - 固定凸起方向为右侧
     * @param {CanvasRenderingContext2D} ctx - 画布上下文
     * @param {number} mX - 起始X坐标
     * @param {number} n - 形状编号(可选)
     * @param {number} cY - Y坐标(可选)
     * @returns {number} 拼图形状编号
     */
    function drawPuzzleShape(ctx, mX, n, cY) {
        const { radius: r, size: s } = PUZZLE_CONFIG;
        // 限制拼图形状只使用凸起方向为右侧的形状（上凸右凸）
        const number = 4;

        // 如果没有提供Y坐标，则使用中心点
        const yPos = (cY !== undefined) ? cY : (puzzleState.centerY || PUZZLE_CONFIG.canvasHeight / 2);

        // 绘制完整的拼图形状（矩形 + 上凸右凸）
        // 从左上角开始绘制
        ctx.moveTo(mX, yPos); // 左上角

        // 上边（带上凸形状）
        ctx.lineTo(mX + s/2 - r, yPos);
        ctx.arc(mX + s/2, yPos, r, Math.PI, 2 * Math.PI);
        ctx.lineTo(mX + s, yPos);

        // 右边（带右凸形状）
        ctx.lineTo(mX + s, yPos + s/2 - r);
        ctx.arc(mX + s, yPos + s/2, r, 1.5 * Math.PI, 0.5 * Math.PI);
        ctx.lineTo(mX + s, yPos + s);

        // 底边和左边（直线）
        ctx.lineTo(mX, yPos + s);
        ctx.lineTo(mX, yPos);

        return number;
    }

    /**
     * 更新拼图块位置
     */
    function updatePuzzlePiece() {
        if (!ctx.overlay || !puzzleState.imgData) {
            console.error('缺少必要的拼图数据');
            return;
        }

        // 清除上一帧
        ctx.overlay.clearRect(0, 0, PUZZLE_CONFIG.canvasWidth, PUZZLE_CONFIG.canvasHeight);

        // 获取曲线上的当前位置
        const position = getPositionOnCurve(puzzleState.moveX);

        // 在曲线路径上标记当前位置
        if (document.getElementById('curve_path')) {
            const pathCtx = document.getElementById('curve_path').getContext('2d');
            pathCtx.beginPath();
            pathCtx.arc(position.x, position.y, 3, 0, Math.PI * 2);
            pathCtx.fillStyle = 'rgba(255, 255, 0, 0.8)';
            pathCtx.fill();
        }

        // 使用离屏Canvas预渲染拼图块，减少闪烁
        if (!puzzleState.offscreenCanvas) {
            puzzleState.offscreenCanvas = document.createElement('canvas');
            puzzleState.offscreenCanvas.width = PUZZLE_CONFIG.size*2;
            puzzleState.offscreenCanvas.height = PUZZLE_CONFIG.size*2;
            puzzleState.offscreenCtx = puzzleState.offscreenCanvas.getContext('2d');
        }

        const offCtx = puzzleState.offscreenCtx;
        offCtx.clearRect(0, 0, puzzleState.offscreenCanvas.width, puzzleState.offscreenCanvas.height);

        // 绘制拼图到离屏Canvas
        offCtx.putImageData(puzzleState.imgData, 0, 0);

        // 创建拼图形状路径（用于剪切）
        offCtx.globalCompositeOperation = "destination-in";
        offCtx.save();
        offCtx.beginPath();

        // 使用正确的参数 - 这里是关键，需要使用固定的起点位置
        const offsetX = PUZZLE_CONFIG.radius; // 偏移量确保拼图在Canvas中心
        const offsetY = PUZZLE_CONFIG.radius;
        drawPuzzleShape(offCtx, offsetX, puzzleState.number, offsetY);

        offCtx.closePath();
        offCtx.fill();
        offCtx.clip();
        offCtx.restore();

        // 恢复默认合成模式，添加描边
        offCtx.globalCompositeOperation = "source-over";
        offCtx.beginPath();
        drawPuzzleShape(offCtx, offsetX, puzzleState.number, offsetY);
        offCtx.closePath();
        offCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        offCtx.lineWidth = 2;
        offCtx.stroke();

        // 将离屏Canvas绘制到实际Canvas上的正确位置
        ctx.overlay.save();
        ctx.overlay.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.overlay.shadowBlur = 5;
        ctx.overlay.shadowOffsetX = 2;
        ctx.overlay.shadowOffsetY = 2;

        // 绘制到曲线上的当前位置
        ctx.overlay.drawImage(
            puzzleState.offscreenCanvas,
            position.x - PUZZLE_CONFIG.radius,
            position.y - PUZZLE_CONFIG.radius
        );

        ctx.overlay.restore();

        console.log('拼图块已更新:', position.x, position.y);
    }

    /**
     * 生成平滑曲线路径
     */
    function generateSmoothCurvePath() {
        const controlPoints = generateControlPoints();
        const { resolution } = PUZZLE_CONFIG.curve;
        const points = [];
        let totalLength = 0;
        let lastPoint = null;

        // 使用Catmull-Rom样条曲线
        for (let i = 0; i < controlPoints.length - 1; i++) {
            const p1 = controlPoints[i];
            const p2 = controlPoints[i + 1];

            // 计算控制点
            const cp1 = i > 0 ? controlPoints[i - 1] : p1;
            const cp2 = i < controlPoints.length - 2 ? controlPoints[i + 2] : p2;

            // 生成曲线点
            for (let j = 0; j <= resolution; j++) {
                const t = j / resolution;

                const x = catmullRomInterpolate(cp1.x, p1.x, p2.x, cp2.x, t);
                const y = catmullRomInterpolate(cp1.y, p1.y, p2.y, cp2.y, t);

                const point = { x, y };

                if (i === 0 || j > 0) {
                    points.push(point);

                    if (lastPoint) {
                        const dx = point.x - lastPoint.x;
                        const dy = point.y - lastPoint.y;
                        totalLength += Math.sqrt(dx * dx + dy * dy);
                    }
                    lastPoint = point;
                }
            }
        }

        return {
            points,
            totalLength,
            controlPoints
        };
    }

    /**
     * Catmull-Rom样条插值
     */
    function catmullRomInterpolate(p0, p1, p2, p3, t) {
        const t2 = t * t;
        const t3 = t2 * t;

        return 0.5 * (
            (2 * p1) +
            (-p0 + p2) * t +
            (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
            (-p0 + 3 * p1 - 3 * p2 + p3) * t3
        );
    }

    /**
     * 生成随机控制点
     */
    function generateControlPoints() {
        const points = [];
        const { points: numPoints, yMargin } = PUZZLE_CONFIG.curve;
        const yMin = PUZZLE_CONFIG.canvasHeight * yMargin;
        const yMax = PUZZLE_CONFIG.canvasHeight * (1 - yMargin);

        // 第一个点固定在左侧
        points.push({
            x: Math.random() * (PUZZLE_CONFIG.canvasWidth * 0.2),
            y: yMin + Math.random() * (yMax - yMin)
        });

        // 中间点完全随机分布
        for (let i = 1; i < numPoints - 1; i++) {
            const x = Math.random() * PUZZLE_CONFIG.canvasWidth;
            const y = yMin + Math.random() * (yMax - yMin);
            points.push({ x, y });
        }

        // 最后一个点固定在右侧
        points.push({
            x: PUZZLE_CONFIG.canvasWidth * 0.8 + Math.random() * (PUZZLE_CONFIG.canvasWidth * 0.2),
            y: yMin + Math.random() * (yMax - yMin)
        });

        return points;
    }

    /**
     * 在曲线上随机选择目标点
     */
    function selectTargetPoint(curve) {
        // 避免选择最开始和最末尾的点
        const minIndex = Math.floor(curve.points.length * 0.2);
        const maxIndex = Math.floor(curve.points.length * 0.8);
        const randomIndex = minIndex + Math.floor(Math.random() * (maxIndex - minIndex));

        return curve.points[randomIndex];
    }

    /**
     * 获取曲线上的位置
     */
    function getPositionOnCurve(moveX) {
        if (!puzzleState.curvePath) return { x: moveX, y: PUZZLE_CONFIG.canvasHeight / 2 };

        // 计算进度
        const progress = (moveX / (puzzleState.dragEndX - puzzleState.dragStartX))
            * PUZZLE_CONFIG.curve.lengthMultiplier;

        // 找到对应点
        const targetIndex = Math.min(
            Math.floor(progress * (puzzleState.curvePath.points.length - 1)),
            puzzleState.curvePath.points.length - 2
        );

        const currentPoint = puzzleState.curvePath.points[targetIndex];
        const nextPoint = puzzleState.curvePath.points[targetIndex + 1];
        const t = (progress * (puzzleState.curvePath.points.length - 1)) % 1;

        return {
            x: currentPoint.x + (nextPoint.x - currentPoint.x) * t,
            y: currentPoint.y + (nextPoint.y - currentPoint.y) * t
        };
    }

    /**
     * 绘制曲线路径
     */
    function drawCurvePath() {
        console.log('绘制曲线路径...');

        // 如果配置为不显示曲线和点，则直接返回
        if (puzzleState.showCurveAndPoints === false) {
            // 清理已有的曲线Canvas
            if (document.getElementById('curve_path')) {
                document.getElementById('curve_path').remove();
            }
            return;
        }

        // 清理旧的曲线Canvas
        if (document.getElementById('curve_path')) {
            document.getElementById('curve_path').remove();
        }

        // 创建路径Canvas
        const pathCanvas = document.createElement('canvas');
        pathCanvas.id = 'curve_path';
        pathCanvas.width = PUZZLE_CONFIG.canvasWidth;
        pathCanvas.height = PUZZLE_CONFIG.canvasHeight;
        pathCanvas.style.position = 'absolute';
        pathCanvas.style.top = '0';
        pathCanvas.style.left = '0';
        pathCanvas.style.zIndex = '4';
        pathCanvas.style.pointerEvents = 'none';

        // 找到正确的父容器
        const container = document.querySelector('.yan_ceng');
        if (!container) {
            console.error('找不到容器元素 .yan_ceng');
            return;
        }
        container.appendChild(pathCanvas);

        // 绘制静态部分
        drawStaticCurveParts();

        // 开始动画
        animateTargetPoint();
    }
    /**
     * 绘制静态曲线部分
     */
    function drawStaticCurveParts() {
        if (!puzzleState.curvePath) return;

        const pathCtx = document.getElementById('curve_path').getContext('2d');
        const points = puzzleState.curvePath.points;
        const controlPoints = puzzleState.curvePath.controlPoints;

        // 绘制曲线
        pathCtx.beginPath();
        pathCtx.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i++) {
            pathCtx.lineTo(points[i].x, points[i].y);
        }

        pathCtx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        pathCtx.lineWidth = 2;
        pathCtx.stroke();

        // 绘制控制点
        for (let i = 0; i < controlPoints.length; i++) {
            const point = controlPoints[i];

            pathCtx.beginPath();
            pathCtx.arc(point.x, point.y, 5, 0, Math.PI * 2);
            pathCtx.fillStyle = [
                'rgba(255, 0, 0, 0.7)',
                'rgba(0, 255, 0, 0.7)',
                'rgba(0, 0, 255, 0.7)',
                'rgba(255, 255, 0, 0.7)',
                'rgba(255, 0, 255, 0.7)'
            ][i];
            pathCtx.fill();

            // 添加标签
            pathCtx.font = "12px Arial";
            pathCtx.fillStyle = "white";
            pathCtx.textAlign = "center";
            pathCtx.fillText(i + 1, point.x, point.y - 10);
        }
    }

    /**
     * 动画目标点
     */
    function animateTargetPoint() {
        const pathCtx = document.getElementById('curve_path').getContext('2d');

        // 清除目标点区域
        const animSize = 12;
        pathCtx.clearRect(
            puzzleState.targetX - animSize,
            puzzleState.targetY - animSize,
            animSize * 2,
            animSize * 2
        );

        // 绘制脉动效果
        puzzleState.targetAnim = (puzzleState.targetAnim || 0) + 0.05;
        const pulseSize = 5 + Math.sin(puzzleState.targetAnim) * 2;

        pathCtx.beginPath();
        pathCtx.arc(puzzleState.targetX, puzzleState.targetY, pulseSize, 0, Math.PI * 2);
        pathCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        pathCtx.fill();

        // 循环动画
        if (!puzzleState.isMatch) {
            // 限制帧率
            if (!puzzleState.lastAnimTime ||
                performance.now() - puzzleState.lastAnimTime > (1000 / PERFORMANCE_CONFIG.animationFrameRate)) {
                puzzleState.lastAnimTime = performance.now();
                requestAnimationFrame(animateTargetPoint);
            } else {
                setTimeout(() => {
                    requestAnimationFrame(animateTargetPoint);
                }, 1000 / PERFORMANCE_CONFIG.animationFrameRate);
            }
        }
    }
});
