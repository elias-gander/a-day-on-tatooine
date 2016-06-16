//the OpenGL context
var gl = null;

// shader programs
var program = null,
    postProcessProgram = null,
    alphaProgram = null;

// utility
var resources = null;
var width = 512, height = 512;

// variables for 2nd rendering step
var renderTargetFramebuffer = null;
var renderTargetColorTexture = null;
var renderTargetDepthTexture = null;
var distortionMapTex = null;

// camera control, set starting viewpoint here!
var cameraEnabled = false;
const camera = {
  rotation: {       // TODO y must never be 0! (normal matrix computation fails)
                    // TODO when enabling free camera during flight, view direction is reset to rotation (how to update rotation angles while computing flight camera rotations)
    x: 7.91,
    y: 149.49
  },
  position: {
    x: 108,
    y: -291,
    z: 1542
  },
  direction: {
    x: 0,
    y: 0,
    z: 0
  },
  speed: 30
};

// descripes the current camera flight plan
const flight = {
  // two types:
  // flying in a straight line
  straight: false,
  // circling around a point
  circling: false,
  // parameters:
  // duration in milliseconds
  duration: 0,
  // starting point of flight
  origin: vec3.fromValues(0,0,0),
  // point to reach/circle around
  target: vec3.fromValues(0,0,0),
  // circling only: degrees turned
  degrees: 0.0,
  // specifies in which direction to jump when starting a circling flight - see todo in view matrix calculation
  initialJumpDir: 1,
  // function that is called after the destination is reached/degrees circled
  callback: function() {},
  // convenience: information about next flight (see straight calculations in render)
  next: "",
  nextTarget: vec3.fromValues(0,0,0),
  // specifies that 100/turnPart % of duration are dedicated to camera orientation towards the target
  turnPart: 0
}

// scenegraph and animation stuff
var root = null;
var timePrev = 0;
var leiaRotNode;
var billTranNode;
var sun1TranNode;

// animation scenes
//volleyball scene 1
var volleyballSceneTranNode; //complete scene
var volleyballTranNode; //ball translation
var volleyballDirection = 1.0; //1 or -1, so the ball flies back and forth
var volleyballSpeed = 0;  //for time-based animation
var volleyballDistance = 100.0; //how far the ball should fly (distance between r2d2)
var volleyballLocation = 0; //current location in volleyballDistance

//sandcrawler scene 2
var sandcrawlerTranNode;
var sandcrawlerPlatformTranNode;
var sandcrawlerMoved = 0; //how much the sandcrawler has moved
var sandcrawlerPlatformDegrees = 0; //how much the platform has rotated already

//landspeeder scene 3
var landspeederSceneTranNode;
var lukeTranNode;
var landspeederTranNode;
var lukeDegrees = 0; //how much luke has rotated already
var lukeMoved = 0; //how much luke moved to his landspeeder already
var leiaTranNode;


/**
 * initializes OpenGL context, compile shader, and load buffers
 */
function init(resources) {
  //create a GL context
  gl = createContext(width /*width*/, height /*height*/); // TODO which width and height?

  // z-buffer
  gl.enable(gl.DEPTH_TEST);
  // allow alpha textures
  gl.enable (gl.BLEND) ;
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  //compile and link shader program
  program = createProgram(gl, resources.vs, resources.fs);
  postProcessProgram = createProgram(gl, resources.postProcessVs, resources.postProcessFs);
  alphaProgram = createProgram(gl, resources.alphaVs, resources.alphaFs);

  this.resources = resources;

  // initialize framebuffer and connected textures to allow to texture rendering (for post processing)
  initRenderToTexture();

  //create scenegraph
  root = createSceneGraph(resources);

  // initialize distortion map used in post process shader
  initDistortionMapTexture(resources.distortionMap);

  // setup controls
  initInteraction(gl.canvas);

  // define camera flight using bound callback functions (navigate with free camera, notate positions (allow debug output) then reconstruct the flight here)
  // scene 1
  setupFlight(true, false, 5000, 0, [192,-25,592], 0, 1, 3, "circle", [196,30,299],
    // after finishing straight flight -> setup circling flight
    setupFlight.bind(this, false, true, 5000, 5000, [196,30,299], 160, 1, 3, "straight", [233,-30,411],
      // scene 2
      setupFlight.bind(this, true, false, 4000, 10000, [233,-30,411], 0, 1, 2, "circle", [519,10,531],
        setupFlight.bind(this, false, true, 6000, 14000, [519,10,531], 320, -1, 3, "straight", [734,-30,742],
          // scene 3
          setupFlight.bind(this, true, false, 3000, 20000, [734,-30,742], 0, 1, 2, "circle", [903, 15, 732],
            setupFlight.bind(this, false, true, 3000, 23000, [903, 15, 732], 100, 1, 3, "straight", [905, 5, 1000],
              setupFlight.bind(this, true, false, 4000, 26000, [905, 5, 1000], 0, 1, 2, "", [0,0,0],
                // ends the flight
                setupFlight.bind(this, false, false, 0, 0, [0,0,0], 0, 0, 0, "", [0,0,0], null)
              )
            )
          )
        )
      )
    )
  );
}

/* initializes the distortion map texture by creating a texture from the given image */
function initDistortionMapTexture(image) {
  gl.activeTexture(gl.TEXTURE0);
  distortionMapTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, distortionMapTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);  // repeat needed for shader effect
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
}

function initRenderToTexture() {
  var depthTextureExt = gl.getExtension("WEBGL_depth_texture");
  if(!depthTextureExt) { alert('No depth texture support!!!'); return; }

  //generate color texture (required mainly for debugging and to avoid bugs in some WebGL platforms)
  renderTargetFramebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, renderTargetFramebuffer);

  //create color texture
  renderTargetColorTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, renderTargetColorTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  //create depth texture
  renderTargetDepthTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, renderTargetDepthTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, width, height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);

  //bind textures to framebuffer
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, renderTargetColorTexture, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, renderTargetDepthTexture ,0);

  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!=gl.FRAMEBUFFER_COMPLETE)
    {alert('Framebuffer incomplete!');}

  //clean up
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

/**
  * sets the parameters to run a flight animation while rendering
  * @param callback: it is intended to use setupFlight.bind(this, ...parameters for next flight animation...) for this parameter, which after completing this flight (duration over) sets up the parameters for the next one.
  * This way arbitrary long sequences of flight animations can be defined before starting to render the movie.
  * for other parameters see flight datastructure
  */
function setupFlight(straight, circling, duration, startTime, target, degrees, initialJumpDir, turnPart, next, nextTarget, callback) {
  // stop camera if end of flight
  if(callback == null) {
    cameraEnabled = true;
  } else {
    flight.straight = straight;
    flight.circling = circling;
    flight.duration = duration;
    flight.startTime = startTime;
    flight.origin = vec3.fromValues(camera.position.x, camera.position.y, camera.position.z);
    flight.target = target;
    flight.degrees = degrees;
    flight.initialJumpDir = initialJumpDir;
    flight.turnPart = turnPart;
    flight.next = next;
    flight.nextTarget = nextTarget;
    flight.callback = callback;
  }
}

/**
 * builds up the scenegraph and sets the root and postProcess nodes
 */
function createSceneGraph(resources) {
  // TODO maybe compact this whole stuff a little (make use of children constructor)
  let root = new ShaderSGNode(program);
  let enableTexNode = new SetUniformSGNode('u_enableObjectTexture', true);

  // suns
  let sun1Sphere = makeSphere(20, 20, 20);
  let sun1ModelNode = new RenderSGNode(sun1Sphere);
  let sun1TexNode = new AdvancedTextureSGNode(resources.lightTex);
  let sun1MatNode = new MaterialSGNode();
  sun1MatNode.emission = [1,1,1,1];
  let sun1Node = new MyLightNode([1000, 0, 1000], 0, 180, [0,1,0]);
  sun1TranNode = new TransformationSGNode(glm.transform({translate: [500, -1000, 0]}));

  //scene 1...
  // billboard
  let billboard = makeRect(20, 10);
  let billShaderNode = new ShaderSGNode(alphaProgram);   // trying to use a different shader - how to combine shader results?
  let billModelNode = new RenderSGNode(billboard);
  let billTexNode = new AdvancedTextureSGNode(resources.raidersWatchingTex);
  let billMatNode = new MaterialSGNode();
  billTranNode = new TransformationSGNode(glm.transform({translate: [235, -20, 520]}));

  // volleyball
  let volleyball = makeSphere(4, 0, 0);
  let volleyballModelNode = new RenderSGNode(volleyball);
  let volleyballTexNode = new AdvancedTextureSGNode(resources.wilsonTex);
  let volleyballMatNode = new MaterialSGNode();
  volleyballTranNode = new TransformationSGNode(glm.transform({translate: [0, -15, 0]}));

  // r2d2 1
  let r2d21 = resources.r2d2;
  let r2d2ModelNode1 = new RenderSGNode(r2d21);
  let r2d2TexNode1 = new AdvancedTextureSGNode(resources.r2Tex);  // TODO (for all models) use models with decent textures - using single color at the moment
  let r2d2MatNode1 = new MaterialSGNode();
  let r2d2TranNode1 = new TransformationSGNode(glm.transform({rotateX: 180, rotateY: -90, scale:0}));

  // r2d2 2
  let r2d22 = resources.r2d2;
  let r2d2ModelNode2 = new RenderSGNode(r2d22);
  let r2d2TexNode2 = new AdvancedTextureSGNode(resources.r2Tex);
  let r2d2MatNode2 = new MaterialSGNode();
  let r2d2TranNode2 = new TransformationSGNode(glm.transform({translate: [volleyballDistance, 0, 0], rotateX: 180, rotateY: 90}));

  // volleyball scene transformation
  volleyballSceneTranNode = new TransformationSGNode(glm.transform({translate: [180, 50, 300], scale: 0.5, rotateY: 45}));
  //...scene 1

  // scene 2 sandcrawler...
  let sandcrawlerBody = makeSandcrawlerBody();
  let sandcrawlerCrawlersNode = composeCrawlerQuad(resources);
  let sandcrawlerPlatformModelNode = new RenderSGNode(makeRect(0.5, 0.25));
  let sandcrawlerBodyModelNode = new RenderSGNode(sandcrawlerBody);
  let sandcrawlerPlatformTexNode = new AdvancedTextureSGNode(resources.platformTex);
  sandcrawlerPlatformTranNode = new TransformationSGNode(glm.transform({translate: [1.15, 0.2, 0.25], rotateX: -90, rotateY: -45, scale:0.7}));
  let sandcrawlerBodyTexNode = new AdvancedTextureSGNode(resources.rustyMetalTex);
  let sandcrawlerCrawlersTranNode = new TransformationSGNode(glm.transform({translate: [0.5, -0.05, 0]}));    // position crawlers below body
  let sandcrawlerSpotlightNode = new MyLightNode([1.6, 0.5, 0.25], 1, 30, [-1, 2, 1]);
  let sandcrawlerSpotlightModelNode = new RenderSGNode(makeSphere(0.025, 20, 20));
  let sandcrawlerSpotlightTexNode = new AdvancedTextureSGNode(resources.lightTex);
  let sandcrawlerSpotlightMatNode = new MaterialSGNode();
  let sandcrawlerMatNode = new MaterialSGNode();
  sandcrawlerTranNode = new TransformationSGNode(glm.transform({translate: [600, 20, 500], rotateX: 180, rotateY: 180, scale: 50}));
  //...scene 2

  //scene 3...
  // luke
  let luke = resources.luke;
  let lukeModelNode = new RenderSGNode(luke);
  let lukeTexNode = new AdvancedTextureSGNode(resources.hologramTex);
  let lukeMatNode = new MaterialSGNode();
  lukeTranNode = new TransformationSGNode(glm.transform({translate: [40,0,0], rotateX: 180, scale: 30, rotateY: 180}));

  // r2d2
  let r2d2 = resources.r2d2;
  let r2d2ModelNode = new RenderSGNode(r2d2);
  let r2d2TexNode = new AdvancedTextureSGNode(resources.r2Tex);
  let r2d2MatNode = new MaterialSGNode();
  let r2d2TranNode = new TransformationSGNode(glm.transform({translate: [15,0,0], rotateX: 180, rotateY: 90}));

  // leia
  let leia = resources.leia;
  let leiaModelNode = new RenderSGNode(leia);
  let leiaTexNode = new AdvancedTextureSGNode(resources.hologramTex);
  let leiaMatNode = new MaterialSGNode();
  let leiaShaderNode = new ShaderSGNode(alphaProgram);  // leia is a hologram with an alpha texture
  leiaTranNode = new TransformationSGNode(glm.transform({translate: [-25,0,-5], rotateX: 180, rotateY: -90}));

  // landspeeder
  let landspeeder = resources.landspeeder;
  let landspeederModelNode = new RenderSGNode(landspeeder);
  let landspeederTexNode = new AdvancedTextureSGNode(resources.speederTex);
  let landspeederMatNode = new MaterialSGNode();
  // landspeeder is out of...silver: http://devernay.free.fr/cours/opengl/materials.html
  landspeederMatNode.ambient = [0.19225, 0.19225, 0.19225, 1];
  landspeederMatNode.diffuse = [0.50754, 0.50754, 0.50754, 1];
  landspeederMatNode.specular = [0.508273, 0.508273, 0.508273, 1];
  landspeederMatNode.shininess = 0.4;
  landspeederTranNode = new TransformationSGNode(glm.transform({translate: [-25,0,200], rotateX: 180, scale: 15, rotateY: 180}));

  landspeederSceneTranNode = new TransformationSGNode(glm.transform({translate: [910, 30, 730], scale: 0.5, rotateY: 0}));
  //...scene 3

  // terrain generation from heightmap
  let terrain = generateTerrain(resources.heightmap, 16, 16, 120);
  let terrainModelNode = new RenderSGNode(terrain);
  let terrainTexNode = new AdvancedTextureSGNode(resources.sandTex);
  let terrainMatNode = new MaterialSGNode();
  let terrainTranNode = new TransformationSGNode(glm.transform({translate: [0, 100, 0]}));



  // show sandcrawler
  sandcrawlerTranNode.append(sandcrawlerMatNode);
  sandcrawlerMatNode.append(sandcrawlerSpotlightNode);
  sandcrawlerSpotlightNode.append(sandcrawlerSpotlightMatNode);
  sandcrawlerSpotlightMatNode.append(sandcrawlerSpotlightTexNode);
  sandcrawlerSpotlightTexNode.append(sandcrawlerSpotlightModelNode);
  sandcrawlerMatNode.append(sandcrawlerBodyTexNode);
  sandcrawlerMatNode.append(sandcrawlerCrawlersTranNode);
  sandcrawlerMatNode.append(sandcrawlerPlatformTranNode);
  sandcrawlerMatNode.append(enableTexNode);
  sandcrawlerCrawlersTranNode.append(sandcrawlerCrawlersNode);
  sandcrawlerPlatformTranNode.append(sandcrawlerPlatformTexNode);
  sandcrawlerPlatformTexNode.append(sandcrawlerPlatformModelNode);
  sandcrawlerBodyTexNode.append(sandcrawlerBodyModelNode);
  root.append(sandcrawlerTranNode);

  // show terrain
  terrainTranNode.append(terrainMatNode);
  terrainMatNode.append(terrainTexNode);
  terrainTexNode.append(terrainModelNode);
  terrainTexNode.append(enableTexNode);
  root.append(terrainTranNode);

  // show billboard
  billMatNode.append(billShaderNode);
  billShaderNode.append(billTexNode);
  billTexNode.append(enableTexNode);
  billTexNode.append(billModelNode);
  billTranNode.append(billMatNode);
  root.append(billTranNode);

  // show volleyball
  volleyballTranNode.append(volleyballMatNode);
  volleyballMatNode.append(volleyballTexNode);
  volleyballTexNode.append(enableTexNode);
  volleyballTexNode.append(volleyballModelNode);

  // show r2d21
  r2d2TranNode1.append(r2d2MatNode1);
  r2d2MatNode1.append(r2d2TexNode1);
  r2d2TexNode1.append(enableTexNode);
  r2d2TexNode1.append(r2d2ModelNode1);

  // show r2d22
  r2d2TranNode2.append(r2d2MatNode2);
  r2d2MatNode2.append(r2d2TexNode2);
  r2d2TexNode2.append(enableTexNode);
  r2d2TexNode2.append(r2d2ModelNode2);

  // perform transformation on whole scene 1
  volleyballSceneTranNode.append(volleyballTranNode);
  volleyballSceneTranNode.append(r2d2TranNode1);
  volleyballSceneTranNode.append(r2d2TranNode2);
  root.append(volleyballSceneTranNode);

  // show luke
  lukeTranNode.append(lukeMatNode);
  lukeMatNode.append(lukeTexNode);
  lukeTexNode.append(enableTexNode);
  lukeTexNode.append(lukeModelNode);

  // show r2d2
  r2d2TranNode.append(r2d2MatNode);
  r2d2MatNode.append(r2d2TexNode);
  r2d2TexNode.append(enableTexNode);
  r2d2TexNode.append(r2d2ModelNode);

  // show leia
  leiaTranNode.append(leiaMatNode);
  leiaMatNode.append(leiaShaderNode);
  leiaShaderNode.append(leiaTexNode);
  leiaTexNode.append(enableTexNode);
  leiaTexNode.append(leiaModelNode);

  // show landspeeder
  landspeederTranNode.append(landspeederMatNode);
  landspeederMatNode.append(landspeederTexNode);
  landspeederTexNode.append(enableTexNode);
  landspeederTexNode.append(landspeederModelNode);

  // perform transformation on whole scene 3
  landspeederSceneTranNode.append(lukeTranNode);
  landspeederSceneTranNode.append(r2d2TranNode);
  landspeederSceneTranNode.append(leiaTranNode);
  landspeederSceneTranNode.append(landspeederTranNode);
  root.append(landspeederSceneTranNode);

  // show suns
  sun1Node.append(sun1ModelNode);
  sun1MatNode.append(sun1Node);
  sun1TexNode.append(enableTexNode);
  sun1TexNode.append(sun1Node);
  sun1TranNode.append(sun1TexNode);
  root.append(sun1TranNode);

  return root;
}

/**
  * returns a (manually composed) sandcrawler body
  */
function makeSandcrawlerBody() {
  // TODO problems with texture coodinates or normals

  // returns
  var vertices = [];
  var normal = [];
  var texture = [];
  var index = [];

  // every plane of the model has it's one vertices because for hard edges we want multiple normal vectors for a vertex!
  // back part of body is just a quad
  vertices.push(
    // side face
    0,0,0,  //0
    0,.75,0,  //1
    1,0,0,  //2
    1,.75,0,  //3
    // top face
    0,.75,0,  //4
    1,.75,0,  //5
    0,.75,.5, //6
    1,.75,.5, //7
    // other side face
    0,.75,.5, //8
    1,.75,.5, //9
    0,0,.5, //10
    1,0,.5, //11
    // backface
    0,0,0, //12
    0,.75,0, //13
    0,0,.5, //14
    0,.75,.5 //15
  )

  // back body texture coordinates
  texture.push(
    0,0,  0,1,  1,0,  1,1,
    0,0,  0,1,  1,0,  1,1,
    0,0,  0,1,  1,0,  1,1,
    0,0,  0,1,  1,0,  1,1
  )

  // now triangles
  index.push(
    // side face
    0,1,3,
    0,2,3,
    // top face
    4,6,7,
    7,5,4,
    // other side face
    8,9,10,
    10,11,9,
    // backface
    12,13,15,
    15,14,12
  )

  // front part of body ... trapezes
  vertices.push(
    // side face
    1,0,0, //16
    1,.75,0, //17
    1.6,.5,.1, //18
    1.6,.75,.1, //19
    // top face
    1,.75,0, //20
    1,.75,.5, //21
    1.6,.75,.1, //22
    1.6,.75,.4,   //23
    // other side face
    1,0,.5, //24
    1,.75,.5, //25
    1.6,.5,.4,  //26
    1.6,.75,.4, //27
    // top front face
    1.6,.5,.1, //28
    1.6,.75,.1, //29
    1.6,.5,.4, //30
    1.6,.75,.4, //31
    // bottom front face
    1,0,0, //32
    1.6,.5,.1, //33
    1,0,.5, //34
    1.6,.5,.4 //35
  )

  // front body texture coordinates
  texture.push(
    0,0,  0,1,  1,0,  1,1,
    0,0,  0,1,  1,0,  1,1,
    0,0,  0,1,  1,0,  1,1,
    0,0,  0,1,  1,0,  1,1,
    0,0,  0,1,  1,0,  1,1
  )

  // now triangles again
  index.push(
    // side face
    16,17,19,
    19,18,16,
    // top face
    20,21,23,
    23,22,20,
    // other side face
    24,25,27,
    27,26,24,
    // top front face
    28,29,31,
    31,30,28,
    // bottom front face
    32,33,35,
    35,34,32
  )

  // now build vertex - triangle datastructure to automatically compute normals
  // TODO put triangle vertex indices in correct order for normal computation?
  var vertexTriangles = [];
  vertexTriangles.push([0,1,3,  0,3,2]);
  vertexTriangles.push([1,0,3]);
  vertexTriangles.push([2,0,3]);
  vertexTriangles.push([3,0,1,  3,0,2]);

  vertexTriangles.push([4,6,7,  4,7,5]);
  vertexTriangles.push([5,7,4]);
  vertexTriangles.push([6,4,7]);
  vertexTriangles.push([7,4,6,  7,5,4]);

  vertexTriangles.push([8,9,10]);
  vertexTriangles.push([9,8,10,  9,10,11]);
  vertexTriangles.push([10,8,9,  10,11,9]);
  vertexTriangles.push([11,10,9]);

  vertexTriangles.push([12,13,15,  12,15,14]);
  vertexTriangles.push([13,12,15]);
  vertexTriangles.push([14,15,12]);
  vertexTriangles.push([15,12,13,  15,14,12]);

  vertexTriangles.push([16,17,19,  16,19,18]);
  vertexTriangles.push([17,16,19]);
  vertexTriangles.push([18,19,16]);
  vertexTriangles.push([19,16,17,  19,18,16]);

  vertexTriangles.push([20,21,23,  20,23,22]);
  vertexTriangles.push([21,20,23]);
  vertexTriangles.push([22,23,20]);
  vertexTriangles.push([23,20,21,  23,22,20]);

  vertexTriangles.push([24,25,27,  24,27,26]);
  vertexTriangles.push([25,24,27]);
  vertexTriangles.push([26,27,24]);
  vertexTriangles.push([27,24,25,  27,26,24]);

  vertexTriangles.push([28,29,31, 28,31,30]);
  vertexTriangles.push([29,28,31]);
  vertexTriangles.push([30,31,28]);
  vertexTriangles.push([31,28,29,  31,30,28]);

  vertexTriangles.push([32,33,35,  32,35,34]);
  vertexTriangles.push([33,32,35]);
  vertexTriangles.push([34,35,32]);
  vertexTriangles.push([35,32,33,  35,34,32]);

  calculateNormals(vertexTriangles, vertices, normal, false);

  return {
    position: vertices,
    normal: normal,
    texture: texture,
    index: index
  };
}


/**
  * Returns the top scenegraph node of a quad with size fitting the sandcrawler
  */
function composeCrawlerQuad(resources) {
  // we need 5 rects
  var left = makeRect(0.25, 0.05);
  var bottom = makeRect(0.5, 0.25);
  var right = makeRect(0.25, 0.05);
  var front = makeRect(0.5, 0.05);
  var back = makeRect(0.5, 0.05);

  var root = new SGNode(
    new SetUniformSGNode('u_enableObjectTexture', true, [
      new TransformationSGNode(glm.transform({rotateX: 180}), new AdvancedTextureSGNode(resources.crawlerTex0, new RenderSGNode(front))),
      new TransformationSGNode(glm.transform({rotateX: 180, translate: [0,0,0.5]}), new AdvancedTextureSGNode(resources.crawlerTex0, new RenderSGNode(back))),
      new TransformationSGNode(glm.transform({rotateY: 90, translate: [-0.5, 0, 0.25]}), new AdvancedTextureSGNode(resources.crawlerTex1, new RenderSGNode(left))),
      new TransformationSGNode(glm.transform({rotateY: 90, translate: [0.5, 0, 0.25]}), new AdvancedTextureSGNode(resources.crawlerTex1, new RenderSGNode(right))),
      new TransformationSGNode(glm.transform({rotateX: -90, translate: [0, -0.05, 0.25]}), new AdvancedTextureSGNode(resources.crawlerTex1, new RenderSGNode(bottom)))
  ]));

  return root;
}


/**
 * generates a planar terrain model generated from a given heightmap
 * @param heightmap: a greyscale image where darker == lower and lighter == higher terrain
 * @param stepX|Y: how many pixels to skip in x|y direction when parsing the heightmap (must divide heightmap width|height)
 * @param heightModifier: resulting height is [0, 1] * heightScaling
 */
// TODO as I realized now - this should have been done in a vertex shader D:
function generateTerrain(heightmap, stepX, stepY, heightScaling) {
  // TODO fix stepX|Y == (1,4,?) somehow connects some endpoints of the plane creating triangles stretched over the whole terrain...

  if(heightmap.width % stepX != 0 || heightmap.height % stepY != 0) {
    return null;
  }

  // read image data:
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
  var texture = [];
  var index = [];

  // current texture coordinates to set
  var currentTC0 = 1;
  var currentTC1 = 0;

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

      // texture coordinates:
      //
      //  01___11___01___11_  ...
      //   |  /|   /|   /|
      //   | / |  / |  / |
      //  00___10___00___10_
      //   |  /|   /|   /|
      //   | / |  / |  / |
      //  01___11___01___11_
      //   |   |    |    |
      //  ...
      //
      texture.push(currentTC0, currentTC1);
      if(currentTC0 == 0 && currentTC1 == 0) {
        currentTC0 = 1;
        currentTC1 = 0;
      } else if(currentTC0 == 0 && currentTC1 == 1) {
        currentTC0 = 1;
        currentTC1 = 1;
      } else if(currentTC0 == 1 && currentTC1 == 0) {
        currentTC0 = 0;
        currentTC1 = 0;
      } else if(currentTC0 == 1 && currentTC1 == 1) {
        currentTC0 = 0;
        currentTC1 = 1;
      }


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
          /*texture.push( 0, 0,
                        1, 0,
                        1, 1);*/
          // keep track of all triangles adjacent to a vertex to compute normals later
          if(!vertexTriangles[vertexIndex]) {
            vertexTriangles[vertexIndex] = [];
          }
          vertexTriangles[vertexIndex].push(vertexIndex, vertexIndex + meshWidth, vertexIndex + meshWidth - 1);
          if(!vertexTriangles[vertexIndex+meshWidth]) {
            vertexTriangles[vertexIndex+meshWidth] = [];
          }
          vertexTriangles[vertexIndex+meshWidth].push(vertexIndex + meshWidth, vertexIndex + meshWidth - 1, vertexIndex);
          if(!vertexTriangles[vertexIndex+meshWidth-1]) {
            vertexTriangles[vertexIndex+meshWidth-1] = [];
          }
          vertexTriangles[vertexIndex+meshWidth-1].push(vertexIndex + meshWidth - 1, vertexIndex, vertexIndex + meshWidth);
        }

        if(x < heightmap.width - 1) {
          // not last vertex in line
          // push type A
          index.push(vertexIndex, vertexIndex + 1, vertexIndex + meshWidth);
          // add texture coordinates
          /*texture.push( 0, 0,
                        0, 1,
                        1, 1);*/
          // keep track of all triangles adjacent to a vertex to compute normals later
          if(!vertexTriangles[vertexIndex]) {
            vertexTriangles[vertexIndex] = [];
          }
          vertexTriangles[vertexIndex].push(vertexIndex, vertexIndex + 1, vertexIndex + meshWidth);
          if(!vertexTriangles[vertexIndex+1]) {
            vertexTriangles[vertexIndex+1] = [];
          }
          vertexTriangles[vertexIndex+1].push(vertexIndex + 1, vertexIndex + meshWidth, vertexIndex);
          if(!vertexTriangles[vertexIndex+meshWidth]) {
            vertexTriangles[vertexIndex+meshWidth] = [];
          }
          vertexTriangles[vertexIndex+meshWidth].push(vertexIndex + meshWidth, vertexIndex, vertexIndex + 1);

        } else {
            // last vertex in line - set new texture coordinates for next line!
            if(currentTC0 == 1 && currentTC1 == 1 || currentTC0 == 0 && currentTC1 == 1) {
              currentTC0 = 0;
              currentTC1 = 0;
            } else if(currentTC0 == 0 && currentTC1 == 0 || currentTC0 == 1 && currentTC1 == 0) {
              currentTC0 = 0;
              currentTC1 = 1;
            }
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

  // calculate terrain normals
  calculateNormals(vertexTriangles, vertices, normal, false);

  return {
    position: vertices,
    normal: normal,
    texture: texture,
    index: index
  };
}

/**
 * calculates the normal vector of every vertex by weighting in the surface normals of all adjacent triangles!
 * @param: vertexTriangles: two-dimensional array that contains triangles in form of vertex indices in the vertices parameter such that: vertexTriangles[123] == triangles adjacent to vertices[123]
                            IMPORTANT: the 3 vertex indices representing each adjacent triangle are expected to always have the current vertex as first vertex and the other two in clockwise ordering around the current vertex
                            an absolute ordering like this is necessary for proper normal calculation as: a cross b != b cross a
 * @param: vertices: array of vertices where 3 sequential numbers constitute a vertex
 * @param: normal: the array where normals should be pushed into
 * @param: convenience flag, results in flipped normals
 */
function calculateNormals(vertexTriangles, vertices, normal, flip) {
  vertexTriangles.forEach(function(adjacentTriangles) {
    var sum = vec3.create();

    for(var i = 0; i < adjacentTriangles.length; i += 3) { // a triangle consists of 3 vertices
      var p0 = vec3.fromValues(vertices[3*adjacentTriangles[i]], vertices[3*adjacentTriangles[i]+1], vertices[3*adjacentTriangles[i]+2]);
      var p1 = vec3.fromValues(vertices[3*adjacentTriangles[i+1]], vertices[3*adjacentTriangles[i+1]+1], vertices[3*adjacentTriangles[i+1]+2]);
      var p2 = vec3.fromValues(vertices[3*adjacentTriangles[i+2]], vertices[3*adjacentTriangles[i+2]+1], vertices[3*adjacentTriangles[i+2]+2]);

      // calculate surface normal of triangle as cross product of two lines of the triangle
      var p0_p1 = vec3.subtract(vec3.create(), p0, p1);
      var p0_p2 = vec3.subtract(vec3.create(), p0, p2);
      var surfaceNormal;

      // if for some reason all your hand-entered triangles result in flipped normals... ;)
      if(flip) {
        surfaceNormal = vec3.cross(vec3.create(), p0_p2, p0_p1);
      } else {
        surfaceNormal = vec3.cross(vec3.create(), p0_p1, p0_p2);
      }

      // sum up all surface normals
      // note that the magnitude of the just calculated surface normal is directly proportional to the area of it's triangle
      // thus summing up all surface normals and normalizing the sum is essentially weighting in surface normals according to the area of their triangles
      vec3.add(sum, sum, surfaceNormal);
    }

    // and normalize the sum
    vec3.normalize(sum, sum);

    // we now have the normal vector of one vertex!
    normal.push(sum[0], sum[1], sum[2]);
  });
}


//checks if camera is close enough to an animation scene to start animation
function cameraIsInRadius(point, radius){
  var distance = Math.sqrt(Math.pow(point[0] - camera.position.x, 2) + Math.pow(point[1] - camera.position.y, 2) + Math.pow(point[2] - camera.position.z, 2))
  if(distance <= radius){
    return true;
  }
  return false;
}

// animation transformation functions
function renderMovingLightSource(timeDelta){
  var translate1 = mat4.create();
  translate1 = glm.translate(0, 0, 500);
  var rotate = mat4.create();
  rotate = glm.rotateY(30*timeDelta);
  var translate2 = mat4.create();
  translate2 = glm.translate(0, 0, -500);
  var matrix1 = mat4.multiply(mat4.create(), translate1, rotate);
  var matrix2 = mat4.multiply(mat4.create(), matrix1, translate2);
  sun1TranNode.matrix = mat4.multiply(mat4.create(), sun1TranNode.matrix, matrix2);
}
function renderVolleyballScene(timeDelta){
  //animate only when camera is close enough to whole scene
  if(cameraIsInRadius([volleyballSceneTranNode.matrix[12] + (volleyballDistance / 2), volleyballSceneTranNode.matrix[13], volleyballSceneTranNode.matrix[14]],500)){
    //volleyballDirection determines the direction the ball flies (back and forth)
    if(volleyballLocation <= 0){
      volleyballDirection = 1.0;
    } else if(volleyballLocation >= volleyballDistance){
      volleyballDirection = -1.0;
    }
    //speed depends on current frame rate
    volleyballSpeed = 60.0 * timeDelta * volleyballDirection;

    //the height (y-axis) of the ball depends on a sin() calculation (between 0 and Pi, while Pi corresponds to volleyballDistance)
    var y = -Math.sin(Math.PI/volleyballDistance * volleyballLocation) * volleyballDistance;
    //translate the ball
    volleyballTranNode.matrix = glm.translate(volleyballLocation, y - 20, 0);
    volleyballLocation += volleyballSpeed;
  }
}
function renderSandcrawlerScene(timeDelta){
  if(cameraIsInRadius([sandcrawlerTranNode.matrix[12], sandcrawlerTranNode.matrix[13], sandcrawlerTranNode.matrix[14]], 500)){
    if(sandcrawlerMoved < 1.1){ //moves the sandcrawler to a certain point
      var move = timeDelta*0.1;
      sandcrawlerTranNode.matrix = mat4.multiply(mat4.create(), sandcrawlerTranNode.matrix, glm.translate(move, 0, 0));
      sandcrawlerMoved += move;
    }
    if(sandcrawlerPlatformDegrees < 70){ //rotates/opens the platform/ramp of the sandcrawler
      var degreesDelta = 6*timeDelta;
      sandcrawlerPlatformDegrees += degreesDelta;
      sandcrawlerPlatformTranNode.matrix = mat4.multiply(mat4.create(), sandcrawlerPlatformTranNode.matrix, glm.translate(0, 0, -timeDelta*0.0225));
      sandcrawlerPlatformTranNode.matrix = mat4.multiply(mat4.create(), sandcrawlerPlatformTranNode.matrix, glm.rotateY(degreesDelta));
    }
  }
}
function renderLandspeederScene(timeDelta){
  if(cameraIsInRadius([landspeederSceneTranNode.matrix[12], landspeederSceneTranNode.matrix[13], landspeederSceneTranNode.matrix[14]], 300)){
    if(lukeDegrees < 90){ //turns Luke 90° towards the landspeeder
      var degreesDelta = 30*timeDelta;
      lukeDegrees += degreesDelta;
      lukeTranNode.matrix = mat4.multiply(mat4.create(), lukeTranNode.matrix, glm.rotateY(-degreesDelta));
    }
    else if(lukeMoved < 7){ //moves Luke towards the landspeeder
      var moveDelta = 4*timeDelta;
      lukeMoved += moveDelta;
      lukeTranNode.matrix = mat4.multiply(mat4.create(), lukeTranNode.matrix, glm.translate(moveDelta, 0, 0));
      if(lukeMoved >= 7){ //Luke disappears when reaching the landspeeder
        lukeTranNode.matrix = glm.translate(0,100,0);
      }
    } else{ //move the landspeeder
      var moveDelta = 10*timeDelta;
      landspeederTranNode.matrix = mat4.multiply(mat4.create(), landspeederTranNode.matrix, glm.translate(0, 0, moveDelta));
    }

    // spin leia hologram
    leiaTranNode.matrix = mat4.multiply(mat4.create(), leiaTranNode.matrix, glm.rotateY(timeDelta*100));
  }
}
function renderBillboard(context){
  //render billboard
  //identity matrix
  var billTransformation =
  [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
  ];

  /*the billboard faces the camera orthogonally at all time,
  so the billboard has the inverse rotation to the view matrix
  this means we have to inverse the view matrix to get the rotation matrix for the billboard
  Since a rotation matrix is an orthogonal matrix,
  we can just transpose the rotation part of the viewMatrix, to get its inverse
  and then just add the translate part of the billboard to the inverse matrix
  */
  //rotation part
  billTransformation[0] = context.viewMatrix[0];
  billTransformation[1] = context.viewMatrix[4];
  billTransformation[2] = context.viewMatrix[8];
  billTransformation[4] = context.viewMatrix[1];
  billTransformation[5] = context.viewMatrix[5];
  billTransformation[6] = context.viewMatrix[9];
  billTransformation[8] = context.viewMatrix[2];
  billTransformation[9] = context.viewMatrix[6];
  billTransformation[10] = context.viewMatrix[10];
  //translation part
  billTransformation[12] = billTranNode.matrix[12];
  billTransformation[13] = billTranNode.matrix[13];
  billTransformation[14] = billTranNode.matrix[14];
  billTranNode.matrix = billTransformation;
}


/**
 * render one frame (to the screen)
 */
function render(timeInMilliseconds) {
  //calculate delta time for animation
  //convert timeInMilliseconds in seconds
  var timeNow = timeInMilliseconds / 1000;
  var timeDelta = timeNow - timePrev;
  timePrev = timeNow;


  var viewMatrix;
  // camera flight - calculate view matrix
  // TODO keep looking in currentdirection if flight stops/interrupted
  if(!cameraEnabled){
    // how much of the complete flight duration has already passed?
    var flightCompleted = Math.min((timeInMilliseconds - flight.startTime) / flight.duration, 1);
    // allows flight stop, if start time hasn't been reached yet
    if(flightCompleted < 0) {
      flightCompleted = 0;
    }

    if(flight.straight) {
      // move towards target
      // flight route
      var originToTarget = vec3.subtract(vec3.create(), flight.target, flight.origin);
      // calculate the part of the route we should have completed at this time
      var completedRoute = vec3.scale(vec3.create(), originToTarget, flightCompleted);
      // calculate the position we should be on
      var position = vec3.add(vec3.create(), completedRoute, flight.origin);
      // set this as our position
      camera.position.x = position[0];
      camera.position.y = position[1];
      camera.position.z = position[2];

      // rotate view towards target, calculation: CURRENTTARGET = CURRENTDIR + (CURRENTDIR_TO_TARGET) * FLIGHTCOMPLETED, (currentTarget approaches target as flightCompleted approaches 1)
      var currentDirToTarget = vec3.subtract(vec3.create(), flight.target, vec3.fromValues(camera.direction.x, camera.direction.y, camera.direction.z));
      var currentTarget = vec3.add(vec3.create(), vec3.fromValues(camera.direction.x, camera.direction.y, camera.direction.z), vec3.scale(vec3.create(), currentDirToTarget, Math.min(flightCompleted * flight.turnPart, 1)));

      // turn towards next flight target within this flight if next flight is circling (easier to implement here than turning while circling...)
      if(flight.next === 'circle' && flightCompleted >= (1 - 1/flight.turnPart)) {
        currentDirToTarget = vec3.subtract(vec3.create(), flight.nextTarget, currentTarget);
        currentTarget = vec3.add(vec3.create(), currentTarget, vec3.scale(vec3.create(), currentDirToTarget, Math.min((flightCompleted - 1 + 1/flight.turnPart) * flight.turnPart, 1)));
      }

      // finally build the view matrix after calculating movement and rotation
      viewMatrix = mat4.lookAt(mat4.create(), [camera.position.x, camera.position.y, camera.position.z], currentTarget, [0,1,0]);

      //console.log("rotationx: " + camera.rotation.x.toFixed(2) + "  |  rotationy: " + camera.rotation.y.toFixed(2) + "  |  x:" + camera.position.x.toFixed(2) + " y:" + camera.position.y.toFixed(2) + " z:" + camera.position.z.toFixed(2) + "  |  dirx:" + camera.direction.x.toFixed(2) + " diry:" + camera.direction.y.toFixed(2) + " dirz:" + camera.direction.z.toFixed(2));

    } else if(flight.circling) {
      // circle around given target in current distance from target for given degrees
      var radius = Math.abs(vec3.distance(vec3.fromValues(camera.position.x, camera.position.y, camera.position.z), vec3.fromValues(flight.target[0], camera.position.y, flight.target[2]))); // note as we circle on our (fixed) current y position, we actually calculate a circle and not a sphere

      // avoid jump on start of circling by calculating which rotation is equivalent to the current position in the orbit of the target
      var initialDeg = Math.acos((flight.origin[0] - flight.target[0])/radius) * (180/Math.PI);
      var initialDeg2 = Math.asin((flight.origin[2] - flight.target[2])/radius) * (180/Math.PI);   // TODO why is this not the same as initalDeg
      // how many degrees should we have rotated at this point?
      var currentDegrees = flight.degrees * flightCompleted + Math.abs(initialDeg) * flight.initialJumpDir;   // TODO should sometimes be plus and sometimes be minus .... when? dirty fix - specified for each camera flight

      // calculate the x,z point on the target orbit for the current degrees
      camera.position.x = flight.target[0] + radius*Math.cos(glm.deg2rad(currentDegrees));
      camera.position.z = flight.target[2] + radius*Math.sin(glm.deg2rad(currentDegrees));

      // and plug them into lookat
      viewMatrix = mat4.lookAt(mat4.create(), [camera.position.x, camera.position.y, camera.position.z], flight.target, [0,1,0]);

      //console.log("rotationx: " + camera.rotation.x.toFixed(2) + "  |  rotationy: " + camera.rotation.y.toFixed(2) + "  |  x:" + camera.position.x.toFixed(2) + " y:" + camera.position.y.toFixed(2) + " z:" + camera.position.z.toFixed(2) + "  |  dirx:" + camera.direction.x.toFixed(2) + " diry:" + camera.direction.y.toFixed(2) + " dirz:" + camera.direction.z.toFixed(2));
    }

    // initiate next flight when we reached our position
    if(flightCompleted == 1) {
      // update camera direction to smoothly turn again to new target
      camera.direction.x = flight.target[0];
      camera.direction.y = flight.target[1];
      camera.direction.z = flight.target[2];

      flight.callback();
    }

  // free camera
  } else {
    // free moving camera: https://sidvind.com/wiki/Yaw,_pitch,_roll_camera
    let center = [camera.position.x + Math.cos(camera.rotation.x) * Math.sin(camera.rotation.y), camera.position.y + Math.cos(camera.rotation.y), camera.position.z + Math.sin(camera.rotation.y) * Math.sin(camera.rotation.x)];
    // generate view matrix from position, center and up
    viewMatrix = mat4.lookAt(mat4.create(), [camera.position.x, camera.position.y, camera.position.z], center, [0,1,0]);

    // extract normalized direction vector generated by lookAt - used to move in pointed direction
    camera.direction.x = viewMatrix[2];
    camera.direction.y = viewMatrix[6];
    camera.direction.z = viewMatrix[10];
    console.log("rotationx: " + camera.rotation.x.toFixed(2) + "  |  rotationy: " + camera.rotation.y.toFixed(2) + "  |  x:" + camera.position.x.toFixed(2) + " y:" + camera.position.y.toFixed(2) + " z:" + camera.position.z.toFixed(2) + "  |  dirx:" + camera.direction.x.toFixed(2) + " diry:" + camera.direction.y.toFixed(2) + " dirz:" + camera.direction.z.toFixed(2));
  }
  // view matrix calculated at this point!


  // APPLICATION OF POST PROCESS SHADER:
  // first render to texture
  gl.bindFramebuffer(gl.FRAMEBUFFER, renderTargetFramebuffer);
  //setup viewport
  gl.viewport(0, 0, width, height);
  gl.clearColor(176/255, 235/255, 255/255, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  //setup context and camera matrices
  const context = createSGContext(gl);
  // TODO which Field of view/other parameters?
  context.projectionMatrix = mat4.perspective(mat4.create(), 50, gl.drawingBufferWidth / gl.drawingBufferHeight, 1, 5000);
  context.viewMatrix = viewMatrix;

  // do animation Transformations
  renderVolleyballScene(timeDelta);
  renderSandcrawlerScene(timeDelta);
  renderLandspeederScene(timeDelta);
  renderBillboard(context);
  renderMovingLightSource(timeDelta);

  // pfusch in inverse view matrix
  // need to set program to set a uniform
  gl.useProgram(program);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_invView'), false, mat4.invert(mat4.create(), context.viewMatrix));
  //render scenegraph (into framebuffer)
  root.render(context);
  //disable framebuffer (render to screen again)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);


  // now do post processing (rendering framebuffer to screen using post process shader)
  //setup viewport
  gl.viewport(0, 0, width, height);
  gl.clearColor(0.9, 0.9, 0.9, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  //activate the post processing shader
  gl.useProgram(postProcessProgram);
  // set some shader parameters
  gl.uniform1f(gl.getUniformLocation(postProcessProgram, 'time'), timeInMilliseconds/1000);
  gl.uniform1f(gl.getUniformLocation(postProcessProgram, 'distortionFactor'), 0.015);
  gl.uniform1f(gl.getUniformLocation(postProcessProgram, 'riseFactor'), 0.75);
  // set the texture to render in the shader (= pre-rendered scene)
  gl.uniform1i(gl.getUniformLocation(postProcessProgram, 'u_sceneTex'), 0); // texture unit 0
  // set the depthmap
  gl.uniform1i(gl.getUniformLocation(postProcessProgram, 'u_depthMap'), 1); // texture unit 1
  // distortion map
  gl.uniform1i(gl.getUniformLocation(postProcessProgram, 'u_distortionMap'), 2); // texture unit 2
  // bind and activate all needed textures
  gl.activeTexture(gl.TEXTURE0 + 0);
  gl.bindTexture(gl.TEXTURE_2D, renderTargetColorTexture);
  gl.activeTexture(gl.TEXTURE0 + 1);
  gl.bindTexture(gl.TEXTURE_2D, renderTargetDepthTexture);
  gl.activeTexture(gl.TEXTURE0 + 2);  // texture unit 2
  gl.bindTexture(gl.TEXTURE_2D, distortionMapTex);
  // build a fullscreen quad on which we'll render the scene in the framebuffer
  var buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const arr = new Float32Array([
    -1.0, -1.0,
    1.0, -1.0,
    -1.0, 1.0,
    -1.0, 1.0,
    1.0, -1.0,
    1.0, 1.0]);
  //copy data to GPU
  gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
  const positionLocation = gl.getAttribLocation(postProcessProgram, 'a_position');
  gl.enableVertexAttribArray(positionLocation);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  // re-render the stored scene applying the post processing shader effect
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  //request another call as soon as possible
  requestAnimationFrame(render);
}



//load the shader resources using a utility function
loadResources({
  // shaders
  vs: 'shader/phong.vs.glsl',
  fs: 'shader/phong.fs.glsl',
  postProcessVs: 'shader/heatshimmer.vs.glsl',
  postProcessFs: 'shader/heatshimmer.fs.glsl',
  distortionMap: 'assets/distortion_map.jpg',
  alphaVs: 'shader/alpha.vs.glsl',
  alphaFs: 'shader/alpha.fs.glsl',

  // terrain
  heightmap: 'assets/terrain/heightmap.png',
  sandTex: 'assets/sand.jpg',

  // other textures
  rustyMetalTex: 'assets/rusty_metal.jpg',
  crawlerTex0: 'assets/crawlers0.jpg',
  crawlerTex1: 'assets/crawlers1.jpg',
  platformTex: 'assets/platform.jpg',
  hologramTex: 'assets/hologram.png',
  speederTex: 'assets/speeder.jpg',
  raidersWatchingTex: 'assets/raiders_watching.png',
  r2Tex: 'assets/r2.jpg',
  wilsonTex: 'assets/wilson.jpg',
  lightTex: 'assets/light.jpg',

  // models
  leia: 'assets/models/leia/Leia/Leia.obj',
  luke: 'assets/models/Luke/Luke yavin.obj',
  r2d2: 'assets/models/R2D2/R2D2.obj',
  landspeeder: 'assets/models/Landspeeder/Landspeeder.obj'

}).then(function (resources /*an object containing our keys with the loaded resources*/) {
  init(resources);

  //render one frame
  render(0);
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
    if (mouse.leftButtonDown && cameraEnabled) {
      //add the relative movement of the mouse to the rotation variables
  		camera.rotation.x -= delta.x / 1000;
      camera.rotation.y += delta.y / 1000;
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
    if (event.code === 'KeyC') {
      cameraEnabled = !cameraEnabled;
    }
  });

  // forward/backward movement
  document.addEventListener('keydown', function(event) {
    if(event.code === 'ArrowUp' && cameraEnabled) {
      camera.position.x -= camera.direction.x * camera.speed;
      camera.position.y -= camera.direction.y * camera.speed;
      camera.position.z -= camera.direction.z * camera.speed;

    } else if(event.code === 'ArrowDown' && cameraEnabled) {
      camera.position.x += camera.direction.x * camera.speed;
      camera.position.y += camera.direction.y * camera.speed;
      camera.position.z += camera.direction.z * camera.speed;
    }
  })
}

/**
  * extended light node implementation - supports multiple lightsources and spotlights - only use this from now on
  * every light is a spotlight - use >= 180 angle for directional light
  * @param index: every lightnode must have an index that is unique over all lightnodes - also must be < MAX_LIGHTS in shaders
  * @param coneAngle: the cone of the spotlight has an angle of +- coneAngle from coneDirection
  * @param coneDirection: center of the spotlight cone, doesn't have to be normalized
  */
class MyLightNode extends TransformationSGNode {

  constructor(position, index, coneAngle, coneDirection, children) {
    super(children);
    this.position = position || [0, 0, 0];
    this.ambient = [0, 0, 0, 1];
    this.diffuse = [1, 1, 1, 1];
    this.specular = [1, 1, 1, 1];

    this.index = index;
    this.uniform = 'u_light';

    this.coneAngle = coneAngle;
    this.coneDirection = coneDirection;

    this._worldPosition = null;
  }

  setLightUniforms(context) {
    const gl = context.gl;
    //no materials in use
    if (!context.shader || !isValidUniformLocation(gl.getUniformLocation(context.shader, this.uniform + '[' + this.index + ']' + '.ambient'))) {
      return;
    }
    gl.uniform4fv(gl.getUniformLocation(context.shader, this.uniform + '[' + this.index + ']' + '.ambient'), this.ambient);
    gl.uniform4fv(gl.getUniformLocation(context.shader, this.uniform + '[' + this.index + ']' + '.diffuse'), this.diffuse);
    gl.uniform4fv(gl.getUniformLocation(context.shader, this.uniform + '[' + this.index + ']' + '.specular'), this.specular);

    gl.uniform1f(gl.getUniformLocation(context.shader, this.uniform + '[' + this.index + ']' + '.coneAngle'), this.coneAngle);
    gl.uniform3fv(gl.getUniformLocation(context.shader, this.uniform + '[' + this.index + ']' + '.coneDirection'), this.coneDirection);
  }

  setLightPosition(context) {
    const gl = context.gl;
    if (!context.shader || !isValidUniformLocation(gl.getUniformLocation(context.shader, this.uniform+'Pos' + '[' + this.index + ']'))) {
      return;
    }
    const position = this._worldPosition || this.position;
    gl.uniform3f(gl.getUniformLocation(context.shader, this.uniform+'Pos[' + this.index + ']'), position[0], position[1], position[2]);
  }

  computeLightPosition(context) {
    //transform with the current model view matrix
    const modelViewMatrix = mat4.multiply(mat4.create(), context.viewMatrix, context.sceneMatrix);
    const original = this.position;
    const position =  vec4.transformMat4(vec4.create(), vec4.fromValues(original[0], original[1],original[2], 1), modelViewMatrix);

    this._worldPosition = position;
  }

  /**
   * set the light uniforms without updating the last light position
   */
  setLight(context) {
    this.setLightPosition(context);
    this.setLightUniforms(context);
  }

  render(context) {
    this.computeLightPosition(context);
    this.setLight(context);

    //since this a transformation node update the matrix according to my position
    this.matrix = glm.translate(this.position[0], this.position[1], this.position[2]);
    //render children
    super.render(context);
  }
}
