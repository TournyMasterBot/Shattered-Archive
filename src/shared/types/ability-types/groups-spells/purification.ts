import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Purity from "@shared/types/ability-types/spells/Purity";
import EnduringWrath from "@shared/types/ability-types/spells/EnduringWrath";
import DetectVampire from "@shared/types/ability-types/spells/DetectVampire";
import RighteousJudgement from "@shared/types/ability-types/spells/RighteousJudgement";
import CompelledRepentance from "@shared/types/ability-types/spells/CompelledRepentance";
import InsightfulGaze from "@shared/types/ability-types/spells/InsightfulGaze";
import RecantBlasphemy from "@shared/types/ability-types/spells/RecantBlasphemy";
import Fervor from "@shared/types/ability-types/spells/Fervor";
import ShakeResolve from "@shared/types/ability-types/spells/ShakeResolve";
import SacredBond from "@shared/types/ability-types/spells/SacredBond";
import Excommunicate from "@shared/types/ability-types/spells/Excommunicate";
import DivineStaff from "@shared/types/ability-types/spells/DivineStaff";
import ServerCache from "@shared/cache/server-cache";

export class Purification implements IAbilityGroup {
  static instance: Purification;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name;
    this.abilityGroup = AbilityGroup.Purification;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilities = [
      Purity.GetInstance(),
      EnduringWrath.GetInstance(),
      DetectVampire.GetInstance(),
      RighteousJudgement.GetInstance(),
      CompelledRepentance.GetInstance(),
      InsightfulGaze.GetInstance(),
      RecantBlasphemy.GetInstance(),
      Fervor.GetInstance(),
      ShakeResolve.GetInstance(),
      SacredBond.GetInstance(),
      Excommunicate.GetInstance(),
      DivineStaff.GetInstance(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): Purification {
    if (!this.instance) {
      this.instance = new this();
      ServerCache.AbilityGroups[this.instance.name] = this.instance;
    }
    return this.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Purification.GetInstance() as T;
  }
}

export default Purification;
