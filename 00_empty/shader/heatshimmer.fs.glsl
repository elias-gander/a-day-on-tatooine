precision mediump float;

uniform sampler2D u_sceneTex;
uniform sampler2D u_depthMap;
uniform sampler2D u_distortionMap;

uniform float time; // Time used to scroll the distortion map
uniform float distortionFactor; // Factor used to control severity of the effect
uniform float riseFactor; // Factor used to control how fast air rises

varying vec2 v_texCoord;

void main() {
  // spread values from depth map linearly
  // taken from http://stackoverflow.com/questions/6652253/getting-the-true-z-value-from-the-depth-buffer
  float zNear = 1.0;
  float zFar = 5000.0;
  float z_b = texture2D(u_depthMap, v_texCoord).x;
  float z_n = 2.0 * z_b - 1.0;
  float z_e = 2.0 * zNear * zFar / (zFar + zNear - z_n * (zFar - zNear));

   // now use the calculated depth to improve the heat shimmering effect (heat shimmering is less visible for places closer to the camera)
   // heat shimmering effect taken from: https://github.com/SFML/SFML/wiki/Source:-HeatHazeShader
   vec2 distortionMapCoordinate = v_texCoord;
   distortionMapCoordinate.y -= time * riseFactor;
   vec4 distortionMapValue = texture2D(u_distortionMap, distortionMapCoordinate);
   vec2 distortionPositionOffset = distortionMapValue.xy;
   distortionPositionOffset -= vec2(0.5, 0.5);
   distortionPositionOffset *= 2.0;
   distortionPositionOffset *= distortionFactor * min(z_e/500.0, 1.0);   // scale depth value to a fitting level and don't let distortion go crazy
   distortionPositionOffset *= (1.0 - v_texCoord.y);
   vec2 distortedTextureCoordinate = v_texCoord + distortionPositionOffset;
   gl_FragColor = texture2D(u_sceneTex, distortedTextureCoordinate);
}
