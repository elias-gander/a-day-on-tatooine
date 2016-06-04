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
  let root = new ShaderSGNode(program);
  let enableTexNode = new SetUniformSGNode('u_enableObjectTexture', true);

  // --------------------- camera test scene ------------------------
  let sphere = makeSphere();
  let sphereModelNode = new RenderSGNode(sphere);
  let sphereTexNode = new AdvancedTextureSGNode(resources.tex);
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

  let light2Sphere = makeSphere(100, 20, 20);
  let light2ModelNode = new RenderSGNode(lightSphere);
  let light2Node = new LightSGNode([500, -500, 500]);
  // --------------------- camera test scene ------------------------


  // leia
  let leia = resources.leia;
  let leiaModelNode = new RenderSGNode(leia);
  let leiaTexNode = new AdvancedTextureSGNode(resources.leiaTex);   // TODO putting a texture doesn't really work here (whole texture used for every triangle?)
  let leiaMatNode = new MaterialSGNode();
  let leiaTranNode = new TransformationSGNode(glm.transform({translate: [30, -5, 100], rotateX: 180}));

  // sandcrawler
  let sandcrawler = makeSandcrawler();



  // test terrain generation from heightmap
  let terrain = generateTerrain(resources.heightmap, 16, 16, 120);
  let terrainModelNode = new RenderSGNode(terrain);
  let terrainTexNode = new AdvancedTextureSGNode(resources.sandTex);
  let terrainMatNode = new MaterialSGNode();
  let terrainTranNode = new TransformationSGNode(glm.transform({translate: [0, 100, 0]}));

  // show terrain
  terrainTranNode.append(terrainMatNode);
  terrainMatNode.append(terrainTexNode);
  terrainTexNode.append(terrainModelNode);
  terrainTexNode.append(enableTexNode);
  root.append(terrainTranNode);

  // show sandcrawler
  // show leia
  leiaTranNode.append(leiaMatNode);
  leiaMatNode.append(leiaTexNode);
  leiaTexNode.append(enableTexNode);
  leiaTexNode.append(leiaModelNode);
  root.append(leiaTranNode);


  sphereTranNode.append(sphereMatNode);
  sphereMatNode.append(sphereTexNode);
  sphereTexNode.append(enableTexNode);
  sphereTexNode.append(sphereModelNode);
  root.append(sphereTranNode);

  rectShaderNode.append(rectTranNode);
  rectTranNode.append(rectMatNode);
  rectMatNode.append(rectTexNode);
  rectTexNode.append(rectModelNode);
  rectTexNode.append(enableTexNode);
  root.append(rectShaderNode);

  lightNode.append(lightMatNode);   // TODO applying a texture to lightnode changes it's position...why? - try without lightTex/enableTex nodes
  lightMatNode.append(lightTexNode);
  lightTexNode.append(enableTexNode);
  lightTexNode.append(sphereModelNode);
  root.append(lightNode);

  light2Node.append(light2ModelNode);   // TODO how to skin a light node? even second light source to illuminate first does not make texture on first visible
  root.append(light2Node);

  return root;
}

function makeSandcrawler() {
  var body = makeBody();
  var crawlers;
  var spotlights;


  function makeBody() {
    // returns
    var vertices = [];
    var normal = [];
    var texture = [];
    var index = [];

    // back part of body is just a quad
    vertices.push(
      // side face
      0,0,0,  //0
      0,1,0,  //1
      1,0,0,  //2
      1,1,0,  //3

      // top face
      0,1,.5, //4
      1,1,.5, //5

      // other side face
      0,0,.5, //6
      0,1,.5 //7
    );

    // now triangles
    index.push(
      // side face
      0,1,3,
      0,2,3,

      // top face
      1,4,5,
      1,3,5,

      // other side face
      4,5,6,
      5,6,7,

      // backface
      0,1,6,
      1,4,6
    );

    for(var i = 0; i < index.length; i += 3) {
      var triangle = {p0: vec3.fromValues(vertices[3*index[i]], vertices[3*index[i]+1], vertices[3*index[i]+2]),
                      p1: vec3.fromValues(vertices[3*index[i+1]], vertices[3*index[i+1]+1], vertices[3*index[i+1]+2]),
                      p2: vec3.fromValues(vertices[3*index[i+2]], vertices[3*index[i+2]+1], vertices[3*index[i+2]+2])}

      var u = vec3.subtract(vec3.create(), triangle.p1, triangle.p0);
      var v = vec3.subtract(vec3.create(), triangle.p2, triangle.p0);


      /*
      Set Vector U to (Triangle.p2 minus Triangle.p1)
    	Set Vector V to (Triangle.p3 minus Triangle.p1)

    	Set Normal.x to (multiply U.y by V.z) minus (multiply U.z by V.y)
    	Set Normal.y to (multiply U.z by V.x) minus (multiply U.x by V.z)
    	Set Normal.z to (multiply U.x by V.y) minus (multiply U.y by V.x)

    	Returning Normal
      */

    }


  }
}

/**
 * builds up the scenegraph and returns the root node
 * @param heightmap: a greyscale image where darker == lower and lighter == higher terrain
 * @param stepX|Y: how many pixels to skip in x|y direction when parsing the heightmap (must divide heightmap width|height)
 * @param heightModifier: resulting height is [0, 1] * heightScaling
 */
function generateTerrain(heightmap, stepX, stepY, heightScaling) {
  // TODO fix stepX|Y == (1,4,?) does not work! (incorrect triangle indices most likely)

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

  // to calculate vertex normals later
  var vertexTriangles = [];
  // returns
  var vertices = [];
  var normal = [];
  var texture = [];  // TODO set texture coordinates properly?
  var index = [];


  // iterate through image data, skipping according to resolution
  var meshWidth = heightmap.width / stepX + 1;
  var vertexIndex = 0;
  var y = 0, x = 0;
  var lastLine = false;
  while(y < heightmap.height) {
    if(x >= heightmap.width) {
      y += stepY;
      x = 0;

      // to always incorporate the last line of the heightmap into our mesh
      if(y == heightmap.height && stepY != 1) {
        lastLine = true;
        y--;
      }
    } else {

      var i = y * heightmap.width * 4 + x * 4;
      var z = data[i] / 255 * heightScaling;  // deduct z-Value [0, 1] from R-value of pixel (G and B-values in data[i+1..3] are assumed to be equal in greyscale heightmap!);
      //console.log(i + ": (" + data[i] + ", " + data[i+1] + ", " + data[i+2] + ", " + data[i+3] + ")");
      //console.log(z);
      // save vertex
      vertices.push(x, -z, y);   // height of image is height (y) of terrain
      //normal.push(0, -1, 0);     // TODO set normal vectors

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
          texture.push( 0, 0,
                        1, 0,
                        1, 1);
          // keep track of all triangles adjacent to a vertex to compute normals later
          if(!vertexTriangles[vertexIndex]) {
            vertexTriangles[vertexIndex] = [];
          }
          vertexTriangles[vertexIndex].push(vertexIndex, vertexIndex + meshWidth, vertexIndex + meshWidth - 1);
          if(!vertexTriangles[vertexIndex+meshWidth]) {
            vertexTriangles[vertexIndex+meshWidth] = [];
          }
          vertexTriangles[vertexIndex+meshWidth].push(vertexIndex, vertexIndex + meshWidth, vertexIndex + meshWidth - 1);
          if(!vertexTriangles[vertexIndex+meshWidth-1]) {
            vertexTriangles[vertexIndex+meshWidth-1] = [];
          }
          vertexTriangles[vertexIndex+meshWidth-1].push(vertexIndex, vertexIndex + meshWidth, vertexIndex + meshWidth - 1);
        }

        if(x < heightmap.width - 1) {
          // not last vertex in line
          // push type A
          index.push(vertexIndex, vertexIndex + 1, vertexIndex + meshWidth);
          // add texture coordinates
          texture.push( 0, 0,
                        0, 1,
                        1, 1);
          // keep track of all triangles adjacent to a vertex to compute normals later
          if(!vertexTriangles[vertexIndex]) {
            vertexTriangles[vertexIndex] = [];
          }
          vertexTriangles[vertexIndex].push(vertexIndex, vertexIndex + meshWidth, vertexIndex + meshWidth - 1);
          if(!vertexTriangles[vertexIndex+meshWidth]) {
            vertexTriangles[vertexIndex+meshWidth] = [];
          }
          vertexTriangles[vertexIndex+meshWidth].push(vertexIndex, vertexIndex + meshWidth, vertexIndex + meshWidth - 1);
          if(!vertexTriangles[vertexIndex+meshWidth-1]) {
            vertexTriangles[vertexIndex+meshWidth-1] = [];
          }
          vertexTriangles[vertexIndex+meshWidth-1].push(vertexIndex, vertexIndex + meshWidth, vertexIndex + meshWidth - 1);
        }
      }

      vertexIndex++;
      x += stepX;

      // to always incorporate the last column of the heightmap into our mesh
      if(x == heightmap.width && stepX != 1) {
        x--;
      }
    }
  }

  // calculate the normal vector of every vertex by weighting in the surface normals of all adjacent triangles!
  // TODO some outer vertices still have flipped normals but I don't know how to detect them :S
  vertexTriangles.forEach(function(adjacentTriangles) {
    var sum = vec3.create();

    for(var i = 0; i < adjacentTriangles.length; i += 3) { // a triangle consists of 3 vertices
      var p0 = vec3.fromValues(vertices[3*adjacentTriangles[i]], vertices[3*adjacentTriangles[i]+1], vertices[3*adjacentTriangles[i]+2]);
      var p1 = vec3.fromValues(vertices[3*adjacentTriangles[i+1]], vertices[3*adjacentTriangles[i+1]+1], vertices[3*adjacentTriangles[i+1]+2]);
      var p2 = vec3.fromValues(vertices[3*adjacentTriangles[i+2]], vertices[3*adjacentTriangles[i+2]+1], vertices[3*adjacentTriangles[i+2]+2]);

      // calculate surface normal of triangle as cross product of two lines of the triangle
      var surfaceNormal = vec3.cross(vec3.create(), vec3.subtract(vec3.create(), p0, p1), vec3.subtract(vec3.create(), p0, p2));
      // TODO dirty fix: if surface normal has negative y component, it's pointing the wrong direction
      if(surfaceNormal[1] > 0) {
        vec3.inverse(surfaceNormal, surfaceNormal);
      }

      // sum up all surface normals
      vec3.add(sum, sum, surfaceNormal);
    }

    // and normalize the sum
    vec3.normalize(sum, sum);

    // we now have the normal vector of one vertex!
    normal.push(sum[0], sum[1], sum[2]);
  });

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
  // where the camera should point
  let center = [camera.position.x + Math.cos(glm.deg2rad(camera.rotation.x)), camera.position.y + Math.sin(glm.deg2rad(camera.rotation.y)), camera.position.z + Math.cos(glm.deg2rad(camera.rotation.y)) + Math.sin(glm.deg2rad(camera.rotation.x))];
  // camera orientation//
  let up = vec3.cross(vec3.create(), vec3.fromValues(center[0], center[1], center[2]), vec3.fromValues(-1, 0, 0));    // TODO fix pitch...up = [0, 1, 0] does not cause proper pitch, pitch using cross product has weird behaviour when crossing/approaching axes (flipping)
  //let up = [0, 1, 0];
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

  // test different shader
  whiteVs : 'shader/white.vs.glsl',
  whiteFs : 'shader/white.fs.glsl',

  // terrain
  heightmap: 'assets/terrain/heightmap.png',
  tex: 'assets/lava.jpg',
  sunTex: 'assets/sun.jpg',
  sandTex: 'assets/sand.jpg',

  // models
  leia: 'assets/models/leia/Leia/Leia.obj',
  leiaTex: 'assets/models/leia/Leia/Leia Textures/Leia_Diff.png'

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
