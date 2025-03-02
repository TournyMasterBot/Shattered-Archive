import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Plague implements IAbility {
  private static instance: Plague;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `help 'Plague'
PLAGUE
PLAGUE

Syntax: cast 'plague' <target>
The plague spell infests the target with a magical disease of great virulence,
sapping its strength and causing horrific suffering, possibly leading to
death. It is a risky spell to use, as the contagion can spread like
wildfire if the victim makes it to a populated area.`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Plague.instance === undefined) {
      Plague.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Plague {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Plague.GetInstance() as T;
  }
}

export default Plague;
