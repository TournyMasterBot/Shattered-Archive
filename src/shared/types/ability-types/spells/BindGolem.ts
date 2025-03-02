import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class BindGolem implements IAbility {
  private static instance: BindGolem;

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
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
BIND GOLEM

Syntax: cast 'bind golem' <object>

This spell infuses the item cast upon, creating a golem of the appropriate
material type under the control of the invoker. There are various materials
that can be used to bring a golem to life from, ranging from the cheap woods
in the realm to the most expensive eggs available.
`;

    if (BindGolem.instance === undefined) {
      BindGolem.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): BindGolem {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BindGolem.GetInstance() as T;
  }
}

export default BindGolem;
