import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Fog implements IAbility {
  private static instance: Fog;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
help fog
FOG
'FOG'

Syntax: cast 'fog'

This spell fills the room you are in with a dense fog, obscuring the view of
all but the most acute of visions.

See also - WEATHER 
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Fog.instance === undefined) {
      Fog.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Fog {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Fog.GetInstance() as T;
  }
}

export default Fog;
