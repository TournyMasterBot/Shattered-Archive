import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class PolevaultJump implements IAbility {
  private static instance: PolevaultJump;

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
    this.helpFile = `
polevault jump
Syntax: pvjump <direction>

Polevault jump allows a person to catapult themself over a room using a
staff. It does hurt when you fail, and of course it takes a bit more effort
than just walking but it is a very proven way to avoid a room full of people
wanting to wear your blood.
`;

    if (PolevaultJump.instance === undefined) {
      PolevaultJump.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): PolevaultJump {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return PolevaultJump.GetInstance() as T;
  }
}

export default PolevaultJump;
