attribute vec4 a_position;

varying vec2 v_texCoord;

void main() {

  v_texCoord = ((a_position.xyz / a_position.w) * 0.5 + vec3(0.5,0.5,0.5)).xy;

  gl_Position = a_position;
}
