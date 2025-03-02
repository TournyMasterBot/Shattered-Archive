import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import CureBlindness from "@shared/types/ability-types/spells/CureBlindness";
import CureBugbearBite from "@shared/types/ability-types/spells/CureBugbearBite";
import CureDisease from "@shared/types/ability-types/spells/CureDisease";
import CureFatigue from "@shared/types/ability-types/spells/CureFatigue";
import CurePoison from "@shared/types/ability-types/spells/CurePoison";
import ServerCache from "@shared/cache/server-cache";

export class Curative implements IAbilityGroup {
  static instance: Curative;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Curative;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      CureBlindness.GetInstance(),
      CureBugbearBite.GetInstance(),
      CureDisease.GetInstance(),
      CureFatigue.GetInstance(),
      CurePoison.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Curative {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Curative.GetInstance() as T;
  }
}

export default Curative;
