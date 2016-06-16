// Phong Vertex Shader

#define MAX_LIGHTS 5

attribute vec3 a_position;
attribute vec3 a_normal;
attribute vec2 a_texCoord;

uniform mat4 u_modelView;
uniform mat3 u_normalMatrix;
uniform mat4 u_projection;
uniform mat4 u_invView;	// to get only model(and not view) transformated vertex and light position (for spotlight computations)

uniform vec3 u_lightPos[MAX_LIGHTS];

//output of this shader
varying vec3 v_normalVec;
varying vec3 v_lightVec[MAX_LIGHTS];
varying vec3 v_eyeVec;
varying vec2 v_texCoord;
varying vec3 v_lightToSurface[MAX_LIGHTS];

void main() {
	//compute vertex position in eye space
	vec4 eyePosition = u_modelView * vec4(a_position,1);

	//compute normal vector in eye space
  v_normalVec = u_normalMatrix * a_normal;

	//compute variables for light computation
  v_eyeVec = -eyePosition.xyz;
	for(int i = 0; i < MAX_LIGHTS; i++) {
		v_lightVec[i] = u_lightPos[i] - eyePosition.xyz;

		v_lightToSurface[i] = ((u_invView * eyePosition) - u_invView * vec4(u_lightPos[i], 1)).xyz;		// spotlighted is independent of camera movement
	}

	//pass on texture coordinates
	v_texCoord = a_texCoord;

	gl_Position = u_projection * eyePosition;
}
