import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Purity from "@shared/types/ability-types/spells/purity";
import EnduringWrath from "@shared/types/ability-types/spells/enduring-wrath";
import DetectVampire from "@shared/types/ability-types/spells/detect-vampire";
import RighteousJudgement from "@shared/types/ability-types/spells/righteous-judgement";
import CompelledRepentance from "@shared/types/ability-types/spells/compelled-repentance";
import InsightfulGaze from "@shared/types/ability-types/spells/insightful-gaze";
import RecantBlasphemy from "@shared/types/ability-types/spells/recant-blasphemy";
import Fervor from "@shared/types/ability-types/spells/fervor";
import ShakeResolve from "@shared/types/ability-types/spells/shake-resolve";
import SacredBond from "@shared/types/ability-types/spells/sacred-bond";
import Excommunicate from "@shared/types/ability-types/spells/excommunicate";
import DivineStaff from "@shared/types/ability-types/spells/divine-staff";

export class Purification implements IAbilityGroup {
  static instance: Purification;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
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
    if (!Purification.instance) {
      Purification.instance = new Purification();
    }
    return Purification.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Purification.GetInstance() as T;
  }
}

export default Purification;
