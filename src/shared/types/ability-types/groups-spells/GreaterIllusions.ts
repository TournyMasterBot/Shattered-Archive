import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Spook from "@shared/types/ability-types/spells/Spook";
import Vacancy from "@shared/types/ability-types/spells/Vacancy";
import ImprovedInvisibility from "@shared/types/ability-types/spells/ImprovedInvisibility";
import Imposter from "@shared/types/ability-types/spells/Imposter";
import Blur from "@shared/types/ability-types/spells/Blur";
import SummonShadow from "@shared/types/ability-types/spells/SummonShadow";
import FalseImage from "@shared/types/ability-types/spells/FalseImage";
import Paralyze from "@shared/types/ability-types/spells/Paralyze";
import MirrorImage from "@shared/types/ability-types/spells/MirrorImage";
import RainbowPattern from "@shared/types/ability-types/spells/RainbowPattern";
import Blend from "@shared/types/ability-types/spells/Blend";
import ServerCache from "@shared/cache/server-cache";

export class GreaterIllusions implements IAbilityGroup {
  static instance: GreaterIllusions;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.GreaterIllusions;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Spook.GetInstance(),
      Vacancy.GetInstance(),
      ImprovedInvisibility.GetInstance(),
      Imposter.GetInstance(),
      Blur.GetInstance(),
      SummonShadow.GetInstance(),
      FalseImage.GetInstance(),
      Paralyze.GetInstance(),
      MirrorImage.GetInstance(),
      RainbowPattern.GetInstance(),
      Blend.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): GreaterIllusions {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return GreaterIllusions.GetInstance() as T;
  }
}

export default GreaterIllusions;
