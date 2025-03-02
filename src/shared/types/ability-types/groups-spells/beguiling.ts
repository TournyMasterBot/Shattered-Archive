import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Calm from "@shared/types/ability-types/spells/Calm";
import RestoreMind from "@shared/types/ability-types/spells/RestoreMind";
import CharmPerson from "@shared/types/ability-types/spells/CharmPerson";
import Betray from "@shared/types/ability-types/spells/Betray";
import Sleep from "@shared/types/ability-types/spells/Sleep";
import ServerCache from "@shared/cache/server-cache";

export class Beguiling implements IAbilityGroup {
  static instance: Beguiling;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Beguiling;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Calm.GetInstance(),
      RestoreMind.GetInstance(),
      CharmPerson.GetInstance(),
      Betray.GetInstance(),
      Sleep.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Beguiling {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Beguiling.GetInstance() as T;
  }
}

export default Beguiling;
