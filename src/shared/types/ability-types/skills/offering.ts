import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class Offering implements IAbility {
  private static instance: Offering;

  name: string;
  helpFile: string;
  manualDescription?: string | undefined;
  duration?: number | undefined;
  effects?: SkillSpellEffects | undefined;
  group?: string | undefined;
  alternateKeyword?: string | undefined;
  recommendedHelpFileChanges?: string | undefined;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroupType = AbilityGroupType.Skills;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `help offering
OFFERING

Syntax:  Offering <target>

Barbarians with their wilder demeanor and savage outlook, tend to look to
their pray for sacrificial oblations. The corpses of animals can be placed
as an offering in a bone and hide shrine and get blessed by their God.  

Groups containing this skill:  Barbarian

SEE ALSO:  BARBARIAN`;

    if (Offering.instance === undefined) {
      Offering.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Offering {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Offering.GetInstance() as T;
  }
}

export default Offering;
