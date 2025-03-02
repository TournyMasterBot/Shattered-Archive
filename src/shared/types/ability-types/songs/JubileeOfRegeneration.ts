import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class JubileeOfRegeneration implements IAbility {
  private static instance: JubileeOfRegeneration;

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
    this.abilityGroupType = AbilityGroupType.Songs;
    this.abilityUsage = AbilityUsage.Active;
    this.helpFile = `
Jubilee of Regeneration - This jovial chant allows the physical 
regeneration of everyone in the skald's group and within the same room,
however, there is a slight delay upon chanting this tune before it comes 
into effect for the singer and group.
`;
    this.manualDescription = "This song is a chant";

    if (JubileeOfRegeneration.instance === undefined) {
      JubileeOfRegeneration.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): JubileeOfRegeneration {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return JubileeOfRegeneration.GetInstance() as T;
  }
}

export default JubileeOfRegeneration;
