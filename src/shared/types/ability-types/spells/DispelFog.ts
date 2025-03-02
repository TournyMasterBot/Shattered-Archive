import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class DispelFog implements IAbility {
  private static instance: DispelFog;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help 'Dispel Fog'
'DISPEL FOG'
'DISPEL FOG'

Syntax: cast 'dispel fog'

This spell is used to disperse walls of fog that may be present in any given
room.

See also - WEATHER
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (DispelFog.instance === undefined) {
      DispelFog.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): DispelFog {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return DispelFog.GetInstance() as T;
  }
}

export default DispelFog;
