import ServerCache from "@shared/cache/server-cache";
import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";
import SkillSpellEffects from "@shared/types/ability-types/effects";

export class StoneFountain implements IAbility {
  private static instance: StoneFountain;

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
Stone Fountain - When the Skald sings this song, they will summon a 
stone fountain that you may drink from to quench your thirst.
`;
    this.manualDescription = `
* Create a fountain that lasts until copyover
`;

    if (StoneFountain.instance === undefined) {
      StoneFountain.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): StoneFountain {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.Abilities[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return StoneFountain.GetInstance() as T;
  }
}

export default StoneFountain;
