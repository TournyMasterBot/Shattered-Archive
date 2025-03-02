import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import DetectEvil from "@shared/types/ability-types/spells/DetectEvil";
import DetectInvis from "@shared/types/ability-types/spells/DetectInvis";
import Farsight from "@shared/types/ability-types/spells/Farsight";
import LocateObject from "@shared/types/ability-types/spells/LocateObject";
import DetectGood from "@shared/types/ability-types/spells/DetectGood";
import DetectMagic from "@shared/types/ability-types/spells/DetectMagic";
import Identify from "@shared/types/ability-types/spells/Identify";
import KnowLanguages from "@shared/types/ability-types/spells/KnowLanguages";
import DetectHidden from "@shared/types/ability-types/spells/DetectHidden";
import DetectPoison from "@shared/types/ability-types/spells/DetectPoison";
import KnowAlignment from "@shared/types/ability-types/spells/KnowAlignment";
import ServerCache from "@shared/cache/server-cache";

export class Detection implements IAbilityGroup {
  static instance: Detection;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Detection;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      DetectEvil.GetInstance(),
      DetectInvis.GetInstance(),
      Farsight.GetInstance(),
      LocateObject.GetInstance(),
      DetectGood.GetInstance(),
      DetectMagic.GetInstance(),
      Identify.GetInstance(),
      KnowLanguages.GetInstance(),
      DetectHidden.GetInstance(),
      DetectPoison.GetInstance(),
      KnowAlignment.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Detection {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Detection.GetInstance() as T;
  }
}

export default Detection;
