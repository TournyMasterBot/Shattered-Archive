import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Haze implements IAbility {
  private static instance: Haze;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `
HAZE

As Masters of the Mind, the Mentalist can cast a haze over their enemy
causing them to become horribly confused, affecting their cognitive
thinking. This spell gains power as the mentalist rises in levels.

Syntax: cast 'haze' <target>
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Haze.instance === undefined) {
      Haze.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Haze {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Haze.GetInstance() as T;
  }
}

export default Haze;
