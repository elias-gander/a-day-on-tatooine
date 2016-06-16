precision mediump float;

uniform sampler2D u_tex;

varying vec2 v_texCoord;

void main() {
  // holograms will not be illuminated
  gl_FragColor = texture2D(u_tex, v_texCoord);
}
