import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ColorSpray implements IAbility {
  private static instance: ColorSpray;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Color Spray'
COLOR SPRAY 'COLOR SPRAY'
'COLOR SPRAY'

Syntax: cast 'color spray' <target>

An odd spell, in its own way, though useful for the caster at times, the
color spray offers an advanced level of offensive damage against opponents
in battle.

Additionally, it is possible that the effects of the myriad of colors spread
forth from the spell may blind an opponent.

See also - COMBAT 
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (ColorSpray.instance === undefined) {
      ColorSpray.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ColorSpray {
    if (!ColorSpray.instance) {
      ColorSpray.instance = new ColorSpray();
    }
    return ColorSpray.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ColorSpray.GetInstance() as T;
  }
}

export default ColorSpray;
