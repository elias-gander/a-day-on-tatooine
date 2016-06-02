//the OpenGL context
var gl = null,
    program = null;

// camera control, set starting viewpoint here!
const camera = {
  rotation: {
    x: 90,
    y: 20
  },
  position: {
    x: -0,
    y: -20,
    z: -100
  },
  direction: {
    x: 0,
    y: 0,
    z: 0
  },
  speed: 10  // TODO choose speed
};

// scenegraph
var root = null;

/**
 * initializes OpenGL context, compile shader, and load buffers
 */
function init(resources) {
  //create a GL context
  gl = createContext(800 /*width*/, 600 /*height*/); // TODO which width and height?

  gl.enable(gl.DEPTH_TEST);

  //compile and link shader program
  program = createProgram(gl, resources.vs, resources.fs);

  //create scenegraph
  root = createSceneGraph(resources);

  initInteraction(gl.canvas);
}

/**
 * builds up the scenegraph and returns the root node
 */
function createSceneGraph(resources) {
  // camera test scene
  let root = new ShaderSGNode(program);

  let enableTexNode = new SetUniformSGNode('u_enableObjectTexture', true);

  let sphere = makeSphere();
  let sphereModelNode = new RenderSGNode(sphere);
  let sphereTexNode = new AdvancedTextureSGNode(resources.tex);   // TODO sphere texture doesn't work - FIXED: enable texture by setting uniform u_enableObjectTexture
  let sphereMatNode = new MaterialSGNode();
  let sphereTranNode = new TransformationSGNode(glm.transform({translate: [0, 0, 0]}));

  let rect = makeRect(1.5, 1.3);
  let rectShaderNode = new ShaderSGNode(createProgram(gl, resources.whiteVs, resources.whiteFs));   // trying to use a different shader - how to combine shader results?
  let rectModelNode = new RenderSGNode(rect);
  let rectTexNode = new AdvancedTextureSGNode(resources.tex);
  let rectMatNode = new MaterialSGNode();
  let rectTranNode = new TransformationSGNode(glm.transform({translate: [-6, -6, -6]}));

  let lightSphere = makeSphere(0.5, 20, 20);
  let lightModelNode = new RenderSGNode(lightSphere);
  let lightTexNode = new AdvancedTextureSGNode(resources.sunTex);
  let lightMatNode = new MaterialSGNode();
  let lightNode = new LightSGNode([0, 0, -15]);

  let light2Sphere = makeSphere(0.5, 20, 20);
  let light2ModelNode = new RenderSGNode(lightSphere);
  let light2Node = new LightSGNode([-2, -5, -25]);
  let light2ShaderNode = new ShaderSGNode(createProgram(gl, resources.whiteVs, resources.whiteFs));

  // test terrain generation from heightmap
  let terrain = generateTerrain(resources.heightmap, 16, 16);
  let terrainModelNode = new RenderSGNode(terrain);
  let terrainTexNode = new AdvancedTextureSGNode(resources.sandTex);
  let terrainMatNode = new MaterialSGNode();
  let terrainTranNode = new TransformationSGNode(glm.transform({translate: [100, 100, 100], rotateX: 270}));

  // show terrain
  terrainTranNode.append(terrainMatNode);
  terrainMatNode.append(terrainTexNode);
  terrainTexNode.append(terrainModelNode);
  terrainTexNode.append(enableTexNode);
  root.append(terrainTranNode);


  sphereTranNode.append(sphereMatNode);
  sphereMatNode.append(sphereTexNode);
  sphereTexNode.append(enableTexNode);
  sphereTexNode.append(sphereModelNode);
  root.append(sphereTranNode);

  rectShaderNode.append(rectTranNode);
  rectTranNode.append(rectMatNode);
  rectMatNode.append(rectTexNode);
  rectTexNode.append(rectModelNode);
  root.append(rectShaderNode);

  lightNode.append(lightMatNode);   // TODO applying a texture to lightnode changes it's position...why? - try without lightTex/enableTex nodes
  lightMatNode.append(lightTexNode);
  lightTexNode.append(enableTexNode);
  lightTexNode.append(sphereModelNode);
  root.append(lightNode);

  light2ShaderNode.append(light2Node);
  light2Node.append(light2ModelNode);   // TODO how to skin a light node? even second light source to illuminate first does not make texture on first visible
  root.append(light2ShaderNode);

  return root;
}

/**
 * builds up the scenegraph and returns the root node#
 * @param heightmap: a greyscale image where darker == lower and lighter == higher terrain
 * @param stepX|Y: how many pixels to skip in x|y direction when parsing the heightmap
 */
function generateTerrain(heightmap, stepX, stepY) {
  // TODO fix stepX|Y == 1 does not work! (incorrect triangle indices most likely)

  if(heightmap.width % stepX != 0 || heightmap.height % stepY != 0) {
    return null;
  }

  // Create a Canvas element
  var canvas = document.createElement('canvas');

  // Size the canvas to the element
  canvas.width = heightmap.width;
  canvas.height = heightmap.height;

  // Draw image onto the canvas
  var ctx = canvas.getContext('2d');
  ctx.drawImage(heightmap, 0, 0);

  // Finally, get the image data
  // ('data' is an array of RGBA pixel values for each pixel) ... 1 pixel is 4 sequential values in the array
  var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  // returns
  var vertices = [];
  var normal = [];
  var texture = [];  // TODO set texture coordinates
  var index = [];


  // iterate through image data, skipping according to resolution
  var meshWidth = heightmap.width / stepX + 1;
  var vertexIndex = 0;
  var y = 0, x = 0;
  var lastLine = false;
  while(y < heightmap.height) {
    if(x >= heightmap.width * 4) {
      y += stepY;
      x = 0;

      // to always incorporate the last line of the heightmap into our mesh
      if(y == heightmap.height && stepY != 1) {
        lastLine = true;
        y--;
      }
    } else {

      var i = y * heightmap.width * 4 + x * 4;
      var z = data[i];  // deduct z-Value [0, 1] from R-value of pixel (G and B-values in data[i+1..3] are assumed to be equal in greyscale heightmap!);
      //console.log(i + ": (" + data[i] + ", " + data[i+1] + ", " + data[i+2] + ", " + data[i+3] + ")");
      //console.log(z);
      // save vertex
      vertices.push(x/4, y, z);
      normal.push(0, 1, 0);     // TODO set normal vectors

      // now the harder part: building triangles:
      // from every vertex start 2 triangles: type A = {i, i+1, i+meshWidth} and type B = {i, i+width, i+meshWidth-1}   (meshWidth == vertices in a line)
      // but: no type B triangle from first vertex in line, not type A triangle from last vertex in line, no triangles from vertices in last line
      // this is because we build a plane and not something voluminous
      if(!lastLine) {
        // not in last line
        if(x > 0) {
          // not first vertex in line
          // push type B
          index.push(vertexIndex, vertexIndex + meshWidth, vertexIndex + meshWidth - 1);
          // add texture coordinates
          texture.push( 1, 0,
                        0, 1,
                        1, 1);
        }
        if(x < heightmap.width * 4 - 1) {
          // not last vertex in line
          // push type A
          index.push(vertexIndex, vertexIndex + 1, vertexIndex + meshWidth);
          // add texture coordinates
          texture.push( 0, 0,
                        0, 1,
                        1, 0);
        }
      }

      vertexIndex++;
      x += stepX * 4;

      // to always incorporate the last column of the heightmap into our mesh
      if(x == heightmap.width * 4 && stepX != 1) {
        x--;
      }
    }
  }

  return {
    position: vertices,
    normal: normal,
    texture: texture,
    index: index
  };
}

/**
 * render one frame
 */
function render() {
  gl.clearColor(0.9, 0.9, 0.9, 1.0);

  //clear the buffer
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  //setup context and camera matrices
  const context = createSGContext(gl);

  // TODO which Field of view/other parameters?
  context.projectionMatrix = mat4.perspective(mat4.create(), 50, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.01, 10000);

  // free moving camera: http://gamedev.stackexchange.com/questions/43588/how-to-rotate-camera-centered-around-the-cameras-position
  // gl-matrix doc: http://glmatrix.net/docs/mat4.html
  // TODO fix camera problems: orientating camera when approaching [0,0,0] (test objects) or axes in general ... weird effects when using other field of view (30 would be default)
  // where should the camera point
  let center = [camera.position.x + Math.cos(glm.deg2rad(camera.rotation.x)), camera.position.y + Math.sin(glm.deg2rad(camera.rotation.y)), camera.position.z + Math.cos(glm.deg2rad(camera.rotation.y)) + Math.sin(glm.deg2rad(camera.rotation.x))];
  // camera orientation
  let up = vec3.cross(vec3.create(), vec3.fromValues(center[0], center[1], center[2]), vec3.fromValues(-1, 0, 0));
  // generate view matrix from position, center and up
  let lookAtMatrix = mat4.lookAt(mat4.create(), [camera.position.x, camera.position.y, camera.position.z], center, up);
  context.viewMatrix = lookAtMatrix;

  // extract normalized direction vector generated by lookAt - used to move in pointed direction
  camera.direction.x = lookAtMatrix[2];
  camera.direction.y = lookAtMatrix[6];
  camera.direction.z = lookAtMatrix[10];

  //console.log("rotationx: " + camera.rotation.x.toFixed(2) + "  |  rotationy: " + camera.rotation.y.toFixed(2) + "  |  x:" + camera.position.x.toFixed(2) + " y:" + camera.position.y.toFixed(2) + " z:" + camera.position.z.toFixed(2) + "  |  dirx:" + camera.direction.x.toFixed(2) + " diry:" + camera.direction.y.toFixed(2) + " dirz:" + camera.direction.z.toFixed(2));

  //render scenegraph
  root.render(context);

  //request another call as soon as possible
  requestAnimationFrame(render);
}

//load the shader resources using a utility function
loadResources({
  // TODO shaders - copied from lab
  vs: 'shader/shadow.vs.glsl',
  fs: 'shader/shadow.fs.glsl',

  whiteVs : 'shader/white.vs.glsl',
  whiteFs : 'shader/white.fs.glsl',

  // terrain
  heightmap: 'assets/terrain/heightmap.png',
  tex: 'assets/lava.jpg',
  sunTex: 'assets/sun.jpg',
  sandTex: 'assets/sand.jpg'

}).then(function (resources /*an object containing our keys with the loaded resources*/) {
  init(resources);

  //render one frame
  render();
});

//camera control
function initInteraction(canvas) {
  const mouse = {
    pos: { x : 0, y : 0},
    leftButtonDown: false
  };
  function toPos(event) {
    //convert to local coordinates
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }
  canvas.addEventListener('mousedown', function(event) {
    mouse.pos = toPos(event);
    mouse.leftButtonDown = event.button === 0;
  });
  canvas.addEventListener('mousemove', function(event) {
    const pos = toPos(event);
    const delta = { x : mouse.pos.x - pos.x, y: mouse.pos.y - pos.y };
    if (mouse.leftButtonDown) {
      //add the relative movement of the mouse to the rotation variables
  		camera.rotation.x -= delta.x / 10;
  		camera.rotation.y += delta.y / 10;
    }
    mouse.pos = pos;
  });
  canvas.addEventListener('mouseup', function(event) {
    mouse.pos = toPos(event);
    mouse.leftButtonDown = false;
  });
  //register globally
  document.addEventListener('keypress', function(event) {
    //https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent
    if (event.code === 'KeyR') {
      camera.rotation.x = 0;
  		camera.rotation.y = 0;
    }
  });

  // forward/backward movement
  // TODO not sure if working correctly (passing through some axis)
  document.addEventListener('keydown', function(event) {
    if(event.code === 'ArrowUp') {
      camera.position.x -= camera.direction.x * camera.speed;
      camera.position.y -= camera.direction.y * camera.speed;
      camera.position.z -= camera.direction.z * camera.speed;

    } else if(event.code === 'ArrowDown') {
      camera.position.x += camera.direction.x * camera.speed;
      camera.position.y += camera.direction.y * camera.speed;
      camera.position.z += camera.direction.z * camera.speed;
    }
  })
}
