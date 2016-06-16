// Phong Fragment Shader
// Disclaimer: This phong shader implementation is neither performance optimized nor beautifully coded.
// It shows the basic priciples in a simple way and is sufficient for our lab exercises.
precision mediump float;

#define MAX_LIGHTS 5

/**
 * definition of a material structure containing common properties
 */
struct Material {
	vec4 ambient;
	vec4 diffuse;
	vec4 specular;
	vec4 emission;
	float shininess;
};

/**
 * definition of the light properties related to material properties
 */
struct Light {
	vec4 ambient;
	vec4 diffuse;
	vec4 specular;
	// allow spotlights
	float coneAngle;
	vec3 coneDirection;
};

//illumination related variables
uniform Material u_material;
uniform Light u_light[MAX_LIGHTS];
varying vec3 v_normalVec;
varying vec3 v_eyeVec;
varying vec3 v_lightVec[MAX_LIGHTS];
varying vec3 v_lightToSurface[MAX_LIGHTS];

//texture related variables
uniform bool u_enableObjectTexture;
varying vec2 v_texCoord;
uniform sampler2D u_tex;


vec4 calculateSimplePointLight(Light light, Material material, vec3 lightVec, vec3 normalVec, vec3 eyeVec, vec4 textureColor, float spotlightCoeff) {
	lightVec = normalize(lightVec);
	normalVec = normalize(normalVec);
	eyeVec = normalize(eyeVec);

	//compute diffuse term
	float diffuse = max(dot(normalVec,lightVec),0.0);

	//compute specular term
	vec3 reflectVec = reflect(-lightVec,normalVec);
	float spec = pow( max( dot(reflectVec, eyeVec), 0.0) , material.shininess);

  if(u_enableObjectTexture)
  {
		//replace diffuse and ambient matrial with texture color if texture is available
    material.diffuse = textureColor;
    material.ambient = textureColor;
		//Note: an alternative to replacing the material color is to multiply it with the texture color
  }

	vec4 c_amb  = clamp(light.ambient * material.ambient, 0.0, 1.0);
	vec4 c_diff = clamp(diffuse * light.diffuse * material.diffuse, 0.0, 1.0);
	vec4 c_spec = clamp(spec * light.specular * material.specular, 0.0, 1.0);
	vec4 c_em   = material.emission;

  return c_amb + spotlightCoeff * (c_diff + c_spec) + c_em;
}

void main (void) {

  vec4 textureColor = vec4(0,0,0,1);
  if(u_enableObjectTexture)
  {
    textureColor = texture2D(u_tex,v_texCoord);
  }

	// apply spotlight
	// TODO spotlights aren't perfectly working, try spotlight closer to terrain, over terrain ridges (they aren't being illuminated for some reason - terrain normals?)
	for(int i = 0; i < MAX_LIGHTS; i++) {
		// first calculate the angle between: the vector from the light source to the point in space   AND   the direction of the light (i.e. the center of the cone)
		float lightToSurfaceAngle = degrees(acos(dot(normalize(v_lightToSurface[i]), normalize(u_light[i].coneDirection))));
		// if this angle is smaller or equal to our spotlight angle, the point is within the lightcone and should be fully illuminated by this light source
		if(lightToSurfaceAngle <= u_light[i].coneAngle){
			gl_FragColor += calculateSimplePointLight(u_light[i], u_material, v_lightVec[i], v_normalVec, v_eyeVec, textureColor, 1.0);

		} else {
			// if not, up to 10% offset from the cone angle, we still illuminate the point partially depending on his offset
			// this way we achieve blurred edges of the lightcone
			float edgeCoeff = 0.0;
			float offset = lightToSurfaceAngle - u_light[i].coneAngle;
			if(offset <= u_light[i].coneAngle/10.0) {
					edgeCoeff = (u_light[i].coneAngle/10.0 - offset)/(u_light[i].coneAngle/10.0);
			}
			gl_FragColor += calculateSimplePointLight(u_light[i], u_material, v_lightVec[i], v_normalVec, v_eyeVec, textureColor, edgeCoeff);
		}
	}
}
