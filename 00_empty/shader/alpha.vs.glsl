attribute vec3 a_position;
attribute vec2 a_texCoord;

uniform mat4 u_modelView;
uniform mat4 u_projection;

//output of this shader
varying vec2 v_texCoord;

void main() {
	//compute vertex position in eye space
	vec4 eyePosition = u_modelView * vec4(a_position,1);

	//pass on texture coordinates
	v_texCoord = a_texCoord;

	gl_Position = u_projection * eyePosition;
}
